import _ from 'lodash';
import { Buffer } from 'buffer';
import { Level } from 'level';
import type { AbstractSublevel, AbstractSublevelOptions } from 'abstract-level';

import {
  JSONbigNative, NitroSigner, WrappedError, Uint64,
} from '@cerc-io/nitro-util';

import {
  ErrLoadVouchers, ErrNoSuchChannel, ErrNoSuchObjective, Store, lastBlockNumSeenKey,
} from './store';
import { Objective, ObjectiveStatus } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { ObjectiveId } from '../../../protocols/messages';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';
import { contains, decodeObjective } from './memstore';
import { VirtualChannel } from '../../../channel/virtual';
import { Objective as DirectFundObjective } from '../../../protocols/directfund/directfund';
import { Objective as DirectDefundObjective } from '../../../protocols/directdefund/directdefund';
import { Objective as VirtualFundObjective } from '../../../protocols/virtualfund/virtualfund';
import { Objective as VirtualDefundObjective } from '../../../protocols/virtualdefund/virtualdefund';

const LEVEL_NOT_FOUND = 'LEVEL_NOT_FOUND';

export class DurableStore implements Store {
  private objectives?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private consensusChannels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channelToObjective?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, string>;

  private vouchers?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private lastBlockNumSeen?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, string>;

  // the signer for the store's engine
  private signer?: NitroSigner;

  // the (Ethereum) address associated to the signing key
  private address: string = '';

  // the location where the store's data is stored
  private location: string = '';

  private db?: Level<string, Buffer>;

  // NewDurableStore creates a new DurableStore that uses the given location to store its data
  // In NodeJS, location must be a directory path where LevelDB will store its files
  // In browsers, location is the name of the IDBDatabase to be opened.
  static async newDurableStore(signer: NitroSigner, location: string): Promise<Store> {
    const ps = new DurableStore();
    ps.signer = signer;
    ps.address = await signer.getAddress();
    ps.location = location;

    ps.db = new Level<string, Buffer>(location, { valueEncoding: 'buffer' });

    ps.objectives = ps.openDB<Buffer>('objectives', { valueEncoding: 'buffer' });
    ps.channels = ps.openDB<Buffer>('channels', { valueEncoding: 'buffer' });
    ps.consensusChannels = ps.openDB<Buffer>('consensus_channels', { valueEncoding: 'buffer' });
    ps.channelToObjective = ps.openDB('channel_to_objective');
    ps.vouchers = ps.openDB<Buffer>('vouchers', { valueEncoding: 'buffer' });
    ps.lastBlockNumSeen = ps.openDB('lastBlockNumSeen');

    return ps;
  }

  private openDB<V = string>(
    name: string,
    options: AbstractSublevelOptions<string, V> = {},
  ): AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, V> {
    const subDb = this.db!.sublevel<string, V>(name, options);
    return subDb;
  }

  async close(): Promise<void> {
    await this.db!.close();
  }

  getAddress(): Address {
    return this.address;
  }

  getChannelSigner(): NitroSigner {
    return this.signer!;
  }

  async getObjectiveById(id: ObjectiveId): Promise<Objective> {
    let objJSON: Buffer;
    try {
      objJSON = await this.objectives!.get(id);
    } catch (err) {
      throw ErrNoSuchObjective;
    }

    let obj: Objective;
    try {
      obj = decodeObjective(id, objJSON);
    } catch (err) {
      throw new Error(`error decoding objective ${id}: ${err}`);
    }

    try {
      await this.populateChannelData(obj);
    } catch (err) {
      // TODO: Handle partial return
      // return existing objective data along with error
      // return obj, fmt.Errorf("error populating channel data for objective %s: %w", id, err)

      throw new Error(`error populating channel data for objective ${id}: ${err}`);
    }

    return obj;
  }

  async setObjective(obj: Objective): Promise<void> {
    // todo: locking
    let objJSON: Buffer;
    try {
      objJSON = Buffer.from(JSONbigNative.stringify(obj), 'utf-8');
    } catch (err) {
      throw new Error(`error setting objective ${obj.id()}: ${err}`);
    }

    await this.objectives!.put(obj.id(), objJSON);

    for await (const rel of obj.related()) {
      switch (rel.constructor) {
        case VirtualChannel: {
          const ch = rel as VirtualChannel;
          try {
            await this.setChannel(ch);
          } catch (err) {
            throw new Error(`error setting virtual channel ${ch.id} from objective ${obj.id()}: ${err}`);
          }

          break;
        }

        case Channel: {
          const channel = rel as Channel;
          try {
            await this.setChannel(channel);
          } catch (err) {
            throw new Error(`error setting channel ${channel.id} from objective ${obj.id()}: ${err}`);
          }

          break;
        }

        case ConsensusChannel: {
          const consensusChannel = rel as ConsensusChannel;
          try {
            await this.setConsensusChannel(consensusChannel);
          } catch (err) {
            throw new Error(`error setting consensus channel ${consensusChannel.id} from objective ${obj.id()}: ${err}`);
          }

          break;
        }

        default:
          throw new Error(`unexpected type: ${rel.constructor.name}`);
      }
    }

    // Objective ownership can only be transferred if the channel is not owned by another objective
    let prevOwner: ObjectiveId = '';
    let isOwned: boolean = false;

    try {
      const res = await this.channelToObjective!.get(obj.ownsChannel().string());
      prevOwner = res;
      isOwned = true;
    } catch (err) {
      // Ignore err if not found in DB
    }

    if (obj.getStatus() === ObjectiveStatus.Approved) {
      if (!isOwned) {
        try {
          await this.channelToObjective!.put(obj.ownsChannel().string(), obj.id());
        } catch (err) {
          throw new Error(`cannot transfer ownership of channel: ${err}`);
        }
      }

      if (isOwned && prevOwner !== obj.id()) {
        throw new Error(`cannot transfer ownership of channel from objective ${prevOwner} to ${obj.id()}`);
      }
    }
  }

  // GetLastBlockNumSeen retrieves the last blockchain block processed by this node
  async getLastBlockNumSeen(): Promise<Uint64> {
    let result: bigint;
    let val: string;

    try {
      val = await this.lastBlockNumSeen!.get(lastBlockNumSeenKey);
      result = BigInt(val);
    } catch (err) {
      if ((err as any).code === LEVEL_NOT_FOUND) {
        result = BigInt(0);
        return result;
      }

      throw err;
    }

    return result;
  }

  // SetLastBlockNumSeen sets the last blockchain block processed by this node
  async setLastBlockNumSeen(blockNumber: Uint64): Promise<void> {
    await this.lastBlockNumSeen!.put(lastBlockNumSeenKey, blockNumber.toString());
  }

  // SetChannel sets the channel in the store.
  async setChannel(ch: Channel): Promise<void> {
    const chJSON = Buffer.from(JSONbigNative.stringify(ch), 'utf-8');

    await this.channels!.put(ch.id.string(), chJSON);
  }

  // destroyChannel deletes the channel with id id.
  async destroyChannel(id: Destination): Promise<void> {
    await this.channels!.del(id.string());
  }

  // SetConsensusChannel sets the channel in the store.
  async setConsensusChannel(ch: ConsensusChannel): Promise<void> {
    if (ch.id.isZero()) {
      throw new Error('cannot store a channel with a zero id');
    }

    const chJSON = Buffer.from(JSONbigNative.stringify(ch), 'utf-8');
    await this.consensusChannels!.put(ch.id.string(), chJSON);
  }

  // DestroyChannel deletes the channel with id id.
  async destroyConsensusChannel(id: Destination): Promise<void> {
    await this.consensusChannels!.del(id.string());
  }

  // GetChannelById retrieves the channel with the supplied id, if it exists.
  async getChannelById(id: Destination): Promise<[Channel, boolean]> {
    try {
      const ch = await this._getChannelById(id);

      return [ch, true];
    } catch (err) {
      return [new Channel({}), false];
    }
  }

  // _getChannelById returns the stored channel
  private async _getChannelById(id: Destination): Promise<Channel> {
    let chJSON: Buffer;
    try {
      chJSON = await this.channels!.get(id.string());
    } catch (err) {
      throw ErrNoSuchChannel;
    }

    try {
      const ch = Channel.fromJSON(chJSON.toString());
      return ch;
    } catch (err) {
      throw new Error(`error unmarshaling channel ${id.string()}`);
    }
  }

  // GetChannelsByIds returns a collection of channels with the given ids
  async getChannelsByIds(ids: Destination[]): Promise<Channel[]> {
    const toReturn: Channel[] = [];
    // We know every channel has a unique id
    // so we can stop looking once we've found the correct number of channels

    let err: Error;

    for await (const [, chJSON] of this.channels!.iterator()) {
      let ch: Channel;
      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (unmarshalErr) {
        err = unmarshalErr as Error;
        break;
      }

      // If the channel is one of the ones we're looking for, add it to the list
      if (contains(ids, ch.id)) {
        toReturn.push(ch);
      }

      // If we've found all the channels we need, stop looking
      if (toReturn.length === ids.length) {
        break;
      }
    }

    if (err!) {
      throw err;
    }

    return toReturn;
  }

  // GetChannelsByAppDefinition returns any channels that include the given app definition
  async getChannelsByAppDefinition(appDef: Address): Promise<Channel[]> {
    const toReturn: Channel[] = [];
    let err: Error;

    for await (const [, chJSON] of this.channels!.iterator()) {
      let ch: Channel;

      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (unmarshErr) {
        err = unmarshErr as Error;
        break;
      }

      if (ch.appDefinition === appDef) {
        toReturn.push(ch);
      }
    }

    if (err!) {
      throw err;
    }

    return toReturn;
  }

  // GetChannelsByParticipant returns any channels that include the given participant
  async getChannelsByParticipant(participant: Address): Promise<Channel[]> {
    const toReturn: Channel[] = [];

    for await (const [, chJSON] of this.channels!.iterator()) {
      let ch: Channel;
      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (err) {
        // eslint-disable-next-line no-continue
        continue; // channel not found, continue looking
      }

      const { participants } = ch;
      for (const p of (participants ?? [])) {
        if (p === participant) {
          toReturn.push(ch);
        }
      }
    }

    return toReturn;
  }

  // GetConsensusChannelById returns a ConsensusChannel with the given channel id
  async getConsensusChannelById(id: Destination): Promise<ConsensusChannel> {
    let ch: ConsensusChannel;
    let chJSON: Buffer;

    try {
      chJSON = await this.consensusChannels!.get(id.string());
    } catch (err) {
      throw ErrNoSuchChannel;
    }

    try {
      ch = ConsensusChannel.fromJSON(chJSON.toString());
    } catch (err) {
      throw new Error(`error unmarshaling channel ${ch!.id}`);
    }
    return ch;
  }

  // getConsensusChannel returns a ConsensusChannel between the calling node and
  // the supplied counterparty, if such channel exists
  async getConsensusChannel(counterparty: Address): Promise<[ConsensusChannel | undefined, boolean]> {
    let channel: ConsensusChannel;
    let ok = false;

    for await (const [, chJSON] of this.consensusChannels!.iterator()) {
      let ch: ConsensusChannel;

      try {
        ch = ConsensusChannel.fromJSON(chJSON.toString());
      } catch (err) {
        // eslint-disable-next-line no-continue
        continue; // channel not found, continue looking
      }

      const participants = ch.participants();
      if ((participants ?? []).length === 2) {
        if (participants![0] === counterparty || participants![1] === counterparty) {
          channel = ch;
          ok = true;
          break; // we have found the target channel: break the forEach loop
        }
      }

      // eslint-disable-next-line no-continue
      continue; // channel not found: continue looking
    }

    return [channel!, ok];
  }

  async getAllConsensusChannels(): Promise<ConsensusChannel[]> {
    const toReturn: ConsensusChannel[] = [];
    let unmarshErr: Error | undefined;

    for await (const [, chJSON] of this.consensusChannels!.iterator()) {
      let ch: ConsensusChannel;

      try {
        ch = ConsensusChannel.fromJSON(chJSON.toString());
      } catch (err) {
        unmarshErr = err as Error;
        break;
      }

      toReturn.push(ch!);
    }

    if (unmarshErr) {
      throw unmarshErr;
    }

    return toReturn;
  }

  async getObjectiveByChannelId(channelId: Destination): Promise<[Objective | undefined, boolean]> {
    let id: ObjectiveId;

    try {
      id = await this.channelToObjective!.get(channelId.string());
    } catch (err) {
      return [undefined, false];
    }

    let objective: Objective;
    try {
      objective = await this.getObjectiveById(id);
    } catch (err) {
      // TODO: Handle partial return
      // Return undefined in case of error for now as the partial value is not actually being used
      return [undefined, false];
    }

    return [objective, true];
  }

  // populateChannelData fetches stored Channel data relevant to the given
  // objective and attaches it to the objective. The channel data is attached
  // in-place of the objectives existing channel pointers.
  async populateChannelData(obj: Objective): Promise<void> {
    const id = obj.id();

    switch (obj.constructor) {
      case DirectFundObjective: {
        const o = obj as DirectFundObjective;

        let ch: Channel;
        try {
          ch = await this._getChannelById(o.c!.id);
        } catch (err) {
          throw new Error(`error retrieving channel data for objective ${id}: ${err}`);
        }

        o.c = ch;

        return;
      }
      case DirectDefundObjective: {
        const o = obj as DirectDefundObjective;

        let ch: Channel;
        try {
          ch = await this._getChannelById(o.c!.id);
        } catch (err) {
          throw new Error(`error retrieving channel data for objective ${id}: ${err}`);
        }

        o.c = ch;

        return;
      }
      case VirtualFundObjective: {
        const o = obj as VirtualFundObjective;

        let v: Channel;
        try {
          v = await this._getChannelById(o.v!.id);
        } catch (err) {
          throw new Error(`error retrieving virtual channel data for objective ${id}: ${err}`);
        }

        o.v = new VirtualChannel(v);

        const zeroAddress = new Destination();

        if (o.toMyLeft
          && o.toMyLeft.channel
          && !_.isEqual(o.toMyLeft.channel.id, zeroAddress)
        ) {
          let left: ConsensusChannel;
          try {
            left = await this.getConsensusChannelById(o.toMyLeft.channel.id);
          } catch (err) {
            throw new Error(`error retrieving left ledger channel data for objective ${id}: ${err}`);
          }

          o.toMyLeft.channel = left;
        }

        if (o.toMyRight
          && o.toMyRight.channel
          && !_.isEqual(o.toMyRight.channel.id, zeroAddress)
        ) {
          let right: ConsensusChannel;
          try {
            right = await this.getConsensusChannelById(o.toMyRight.channel.id);
          } catch (err) {
            throw new Error(`error retrieving right ledger channel data for objective ${id}: ${err}`);
          }

          o.toMyRight.channel = right;
        }

        return;
      }
      case VirtualDefundObjective: {
        const o = obj as VirtualDefundObjective;

        let v: Channel;
        try {
          v = await this._getChannelById(o.v!.id);
        } catch (err) {
          throw new Error(`error retrieving virtual channel data for objective ${id}: ${err}`);
        }
        o.v = new VirtualChannel(v);

        const zeroAddress = new Destination();

        if (o.toMyLeft
          && !_.isEqual(o.toMyLeft.id, zeroAddress)
        ) {
          let left: ConsensusChannel;
          try {
            left = await this.getConsensusChannelById(o.toMyLeft.id);
          } catch (err) {
            throw new Error(`error retrieving left ledger channel data for objective ${id}: ${err}`);
          }

          o.toMyLeft = left;
        }

        if (o.toMyRight
          && !_.isEqual(o.toMyRight.id, zeroAddress)
        ) {
          let right: ConsensusChannel;
          try {
            right = await this.getConsensusChannelById(o.toMyRight.id);
          } catch (err) {
            throw new Error(`error retrieving right ledger channel data for objective ${id}: ${err}`);
          }

          o.toMyRight = right;
        }

        return;
      }
      default:
        throw new Error(`objective ${id} did not correctly represent a known Objective type`);
    }
  }

  async releaseChannelFromOwnership(channelId: Destination): Promise<void> {
    await this.channelToObjective!.del(channelId.string());
  }

  async setVoucherInfo(channelId: Destination, v: VoucherInfo): Promise<void> {
    const vJSON = Buffer.from(JSONbigNative.stringify(v));

    await this.vouchers!.put(channelId.string(), vJSON);
  }

  async getVoucherInfo(channelId: Destination): Promise<VoucherInfo> {
    let v = new VoucherInfo({});
    let vJSON: Buffer;

    try {
      vJSON = await this.vouchers!.get(channelId.string());
    } catch (err) {
      throw new WrappedError(
        `channelId ${channelId.string()}: ${ErrLoadVouchers}`,
        ErrLoadVouchers,
      );
    }

    v = VoucherInfo.fromJSON(vJSON.toString());
    return v;
  }

  async removeVoucherInfo(channelId: Destination): Promise<void> {
    return this.vouchers!.del(channelId.string());
  }
}
