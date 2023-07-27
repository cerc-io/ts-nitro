import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';

import { JSONbigNative, bytes2Hex, hex2Bytes } from '@cerc-io/nitro-util';
import type { NitroSigner } from '@cerc-io/nitro-util';

import { ErrNoSuchChannel, ErrNoSuchObjective, Store } from './store';
import { Objective, ObjectiveStatus } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { SafeSyncMap } from '../../../internal/safesync/safesync';
import { ObjectiveId } from '../../../protocols/messages';
import { Address } from '../../../types/types';
import { getAddressFromSecretKeyBytes } from '../../../crypto/keys';
import { VirtualChannel } from '../../../channel/virtual';
import { Destination } from '../../../types/destination';
import { isDirectFundObjective, Objective as DirectFundObjective } from '../../../protocols/directfund/directfund';
import { isDirectDefundObjective, Objective as DirectDefundObjective } from '../../../protocols/directdefund/directdefund';
import { isVirtualFundObjective, Objective as VirtualFundObjective } from '../../../protocols/virtualfund/virtualfund';
import { isVirtualDefundObjective, Objective as VirtualDefundObjective } from '../../../protocols/virtualdefund/virtualdefund';

export class MemStore implements Store {
  objectives?: SafeSyncMap<Buffer>;

  channels?: SafeSyncMap<Buffer>;

  consensusChannels?: SafeSyncMap<Buffer>;

  channelToObjective?: SafeSyncMap<ObjectiveId>;

  vouchers?: SafeSyncMap<Buffer>;

  // the signer for the store's engine
  signer?: NitroSigner;

  // the (Ethereum) address associated to the signing key
  address: string = '';

  static async newMemStore(signer: NitroSigner): Promise<MemStore> {
    const ms = new MemStore();
    ms.signer = signer;
    ms.address = await signer.getAddress();

    ms.objectives = new SafeSyncMap();
    ms.channels = new SafeSyncMap();
    ms.consensusChannels = new SafeSyncMap();
    ms.channelToObjective = new SafeSyncMap();
    ms.vouchers = new SafeSyncMap();

    return ms;
  }

  // Since this is a memory store, there is nothing to close
  close(): void {}

  getAddress(): Address {
    return this.address;
  }

  getChannelSigner(): NitroSigner {
    return this.signer!;
  }

  getObjectiveById(id: ObjectiveId): Objective {
    // todo: locking
    const [objJSON, ok] = this.objectives!.load(id);

    // return immediately if no such objective exists
    if (!ok) {
      throw new Error(`${ErrNoSuchObjective}: ${id}`);
    }

    let obj: Objective;
    try {
      assert(objJSON);
      /* eslint-disable @typescript-eslint/no-use-before-define */
      obj = decodeObjective(id, objJSON);
    } catch (err) {
      throw new Error(`error decoding objective ${id}: ${err}`);
    }

    try {
      this.populateChannelData(obj);
    } catch (err) {
      // TODO: Handle partial return
      // return existing objective data along with error
      // return obj, fmt.Errorf("error populating channel data for objective %s: %w", id, err)

      throw new Error(`error populating channel data for objective ${id}: ${err}`);
    }

    return obj;
  }

  public setObjective(obj: Objective): void {
    // todo: locking
    let objJSON: Buffer;
    try {
      objJSON = Buffer.from(JSONbigNative.stringify(obj), 'utf-8');
    } catch (err) {
      throw new Error(`error setting objective ${obj.id()}: ${err}`);
    }

    this.objectives!.store(obj.id(), objJSON);

    for (const rel of obj.related()) {
      switch (rel.constructor) {
        case VirtualChannel: {
          const ch = rel as VirtualChannel;
          try {
            this.setChannel(ch);
          } catch (err) {
            throw new Error(`error setting virtual channel ${ch.id} from objective ${obj.id()}: ${err}`);
          }

          break;
        }

        case Channel: {
          const channel = rel as Channel;
          try {
            this.setChannel(channel);
          } catch (err) {
            throw new Error(`error setting channel ${channel.id} from objective ${obj.id()}: ${err}`);
          }

          break;
        }

        case ConsensusChannel: {
          const consensusChannel = rel as ConsensusChannel;
          try {
            this.setConsensusChannel(consensusChannel);
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
    const [prevOwner, isOwned] = this.channelToObjective!.load(obj.ownsChannel().string());

    if (obj.getStatus() === ObjectiveStatus.Approved) {
      if (!prevOwner) {
        this.channelToObjective!.store(obj.ownsChannel().string(), obj.id());
      }
      if (isOwned && prevOwner !== obj.id()) {
        throw new Error(`cannot transfer ownership of channel from objective ${prevOwner} to ${obj.id()}`);
      }
    }
  }

  public setChannel(ch: Channel): void {
    const chJSON = Buffer.from(JSONbigNative.stringify(ch), 'utf-8');

    this.channels!.store(ch.id.string(), chJSON);
  }

  // destroyChannel deletes the channel with id id.
  destroyChannel(id: Destination): void {
    this.channels!.delete(id.string());
  }

  // SetConsensusChannel sets the channel in the store.
  setConsensusChannel(ch: ConsensusChannel): void {
    if (ch.id.isZero()) {
      throw new Error('cannot store a channel with a zero id');
    }

    const chJSON = Buffer.from(JSONbigNative.stringify(ch), 'utf-8');

    this.consensusChannels!.store(ch.id.string(), chJSON);
  }

  // DestroyChannel deletes the channel with id id.
  destroyConsensusChannel(id: Destination): void {
    this.consensusChannels!.delete(id.string());
  }

  getChannelById(id: Destination): [Channel, boolean] {
    try {
      const ch = this._getChannelById(id);

      return [ch, true];
    } catch (err) {
      return [new Channel({}), false];
    }
  }

  private _getChannelById(id: Destination): Channel {
    const [chJSON, ok] = this.channels!.load(id.string());

    if (!ok) {
      throw ErrNoSuchChannel;
    }

    assert(chJSON);
    try {
      const ch = Channel.fromJSON(chJSON.toString());
      return ch;
    } catch (err) {
      throw new Error(`error unmarshaling channel ${id.string()}`);
    }
  }

  // GetChannelsByIds returns a collection of channels with the given ids
  getChannelsByIds(ids: Destination[]): Channel[] {
    const toReturn: Channel[] = [];

    let err: Error;

    this.channels!.range((key: string, chJSON: Buffer): boolean => {
      let ch: Channel;
      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (unmarshalErr) {
        err = unmarshalErr as Error;
        return false;
      }

      // If the channel is one of the ones we're looking for, add it to the list
      if (contains(ids, ch.id)) {
        toReturn.push(ch);
      }

      // If we've found all the channels we need, stop looking
      if (toReturn.length === ids.length) {
        return false;
      }

      return true; // otherwise, continue looking
    });

    if (err!) {
      throw err;
    }

    return toReturn;
  }

  // GetChannelsByAppDefinition returns any channels that include the given app definition
  getChannelsByAppDefinition(appDef: Address): Channel[] {
    const toReturn: Channel[] = [];
    let err: Error;

    this.channels!.range((key: string, chJSON: Buffer): boolean => {
      let ch: Channel;

      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (unmarshalErr) {
        err = unmarshalErr as Error;
        return false;
      }

      if (ch.appDefinition === appDef) {
        toReturn.push(ch);
      }
      return true; // channel not found: continue looking
    });

    if (err!) {
      throw err;
    }
    return toReturn;
  }

  // GetChannelsByParticipant returns any channels that include the given participant
  getChannelsByParticipant(participant: Address): Channel[] {
    const toReturn: Channel[] = [];

    this.channels!.range((key: string, chJSON: Buffer) => {
      let ch: Channel;
      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (err) {
        return true; // channel not found, continue looking
      }

      const { participants } = ch;
      for (const p of (participants ?? [])) {
        if (p === participant) {
          toReturn.push(ch);
        }
      }

      return true; // channel not found: continue looking
    });
    return toReturn;
  }

  // GetConsensusChannelById returns a ConsensusChannel with the given channel id
  getConsensusChannelById(id: Destination): ConsensusChannel {
    const [chJSON, ok] = this.consensusChannels!.load(id.string());

    if (!ok) {
      throw ErrNoSuchChannel;
    }
    assert(chJSON);

    let ch: ConsensusChannel;
    try {
      ch = ConsensusChannel.fromJSON(chJSON.toString());
    } catch (err) {
      throw new Error(`error unmarshaling channel ${id.string()}`);
    }

    return ch;
  }

  // getConsensusChannel returns a ConsensusChannel between the calling client and
  // the supplied counterparty, if such channel exists
  getConsensusChannel(counterparty: Address): [ConsensusChannel | undefined, boolean] {
    let channel: ConsensusChannel | undefined;
    let ok = false;

    this.consensusChannels!.range((key: string, chJSON: Buffer): boolean => {
      let ch = new ConsensusChannel({});
      try {
        ch = ConsensusChannel.fromJSON(chJSON.toString());
      } catch (err) {
        return true; // channel not found, continue looking
      }

      const participants = ch.participants();
      if ((participants ?? []).length === 2) {
        if (participants![0] === counterparty || participants![1] === counterparty) {
          channel = ch;
          ok = true;
          return false; // we have found the target channel: break the forEach loop
        }
      }

      return true; // channel not found: continue looking
    });

    return [channel, ok];
  }

  getAllConsensusChannels(): ConsensusChannel[] {
    const toReturn: ConsensusChannel[] = [];
    let err: Error;

    this.consensusChannels!.range((key: string, chJSON: Buffer): boolean => {
      let ch: ConsensusChannel;

      try {
        ch = ConsensusChannel.fromJSON(chJSON.toString());
      } catch (unmarshalErr) {
        err = unmarshalErr as Error;
        return false;
      }

      toReturn.push(ch);
      return true; // channel not found: continue looking
    });

    if (err!) {
      throw err;
    }
    return toReturn;
  }

  getObjectiveByChannelId(channelId: Destination): [Objective | undefined, boolean] {
    // todo: locking
    const [id, found] = this.channelToObjective!.load(channelId.string());
    if (!found) {
      return [undefined, false];
    }

    let objective: Objective;
    try {
      assert(id);
      objective = this.getObjectiveById(id);
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
  populateChannelData(obj: Objective): void {
    const id = obj.id();

    switch (obj.constructor) {
      case DirectFundObjective: {
        const o = obj as DirectFundObjective;

        let ch: Channel;
        try {
          ch = this._getChannelById(o.c!.id);
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
          ch = this._getChannelById(o.c!.id);
        } catch (err) {
          throw new Error(`error retrieving channel data for objective ${id}: ${err}`);
        }

        o.c = ch;

        return;
      }
      case VirtualFundObjective: {
        const o = obj as VirtualFundObjective;

        let ch: Channel;
        try {
          ch = this._getChannelById(o.v!.id);
        } catch (err) {
          throw new Error(`error retrieving virtual channel data for objective ${id}: ${err}`);
        }
        o.v = new VirtualChannel(ch);

        const zeroAddress = new Destination();

        if (o.toMyLeft
          && o.toMyLeft.channel
          && !_.isEqual(o.toMyLeft.channel.id, zeroAddress)
        ) {
          let left: ConsensusChannel;
          try {
            left = this.getConsensusChannelById(o.toMyLeft.channel.id);
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
            right = this.getConsensusChannelById(o.toMyRight.channel.id);
          } catch (err) {
            throw new Error(`error retrieving right ledger channel data for objective ${id}: ${err}`);
          }

          o.toMyRight.channel = right;
        }

        return;
      }
      case VirtualDefundObjective: {
        const o = obj as VirtualDefundObjective;

        let ch: Channel;
        try {
          ch = this._getChannelById(o.v!.id);
        } catch (err) {
          throw new Error(`error retrieving virtual channel data for objective ${id}: ${err}`);
        }
        o.v = new VirtualChannel(ch);

        const zeroAddress = new Destination();

        if (o.toMyLeft
          && !_.isEqual(o.toMyLeft.id, zeroAddress)
        ) {
          let left: ConsensusChannel;
          try {
            left = this.getConsensusChannelById(o.toMyLeft.id);
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
            right = this.getConsensusChannelById(o.toMyRight.id);
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

  releaseChannelFromOwnership(channelId: Destination): void {
    this.channelToObjective!.delete(channelId.string());
  }

  setVoucherInfo(channelId: Destination, v: VoucherInfo): void {
    const jsonData = Buffer.from(JSONbigNative.stringify(v));

    this.vouchers!.store(channelId.string(), jsonData);
  }

  getVoucherInfo(channelId: Destination): [VoucherInfo | undefined, boolean] {
    const [data, ok] = this.vouchers!.load(channelId.string());
    if (!ok) {
      return [undefined, false];
    }

    assert(data);

    try {
      const v = VoucherInfo.fromJSON(data.toString());
      return [v, true];
    } catch (err) {
      return [undefined, false];
    }
  }

  removeVoucherInfo(channelId: Destination): void {
    this.vouchers!.delete(channelId.string());
  }
}

// decodeObjective is a helper which encapsulates the deserialization
// of Objective JSON data. The decoded objectives will not have any
// channel data other than the channel Id.
export function decodeObjective(id: ObjectiveId, data: Buffer): Objective {
  switch (true) {
    case isDirectFundObjective(id): {
      const dfo = DirectFundObjective.fromJSON(data.toString());
      return dfo;
    }
    case isDirectDefundObjective(id): {
      const ddfo = DirectDefundObjective.fromJSON(data.toString());
      return ddfo;
    }
    case isVirtualFundObjective(id): {
      const vfo = VirtualFundObjective.fromJSON(data.toString());
      return vfo;
    }
    case isVirtualDefundObjective(id): {
      const dvfo = VirtualDefundObjective.fromJSON(data.toString());
      return dvfo;
    }
    default:
      throw new Error(`objective id ${id} does not correspond to a known Objective type`);
  }
}

// contains is a helper function which returns true if the given item is included in col
export function contains<T extends Destination | ObjectiveId>(col: T[], item: T): boolean {
  for (const [, i] of col.entries()) {
    if (_.isEqual(i, item)) {
      return true;
    }
  }
  return false;
}
