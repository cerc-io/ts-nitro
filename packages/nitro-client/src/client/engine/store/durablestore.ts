import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';
import { Level } from 'level';
import type { AbstractSublevel } from 'abstract-level';

import { JSONbigNative, bytes2Hex, hex2Bytes } from '@cerc-io/nitro-util';

import { ErrNoSuchObjective, Store } from './store';
import { Objective, ObjectiveStatus } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { ObjectiveId } from '../../../protocols/messages';
import { Address } from '../../../types/types';
import { getAddressFromSecretKeyBytes } from '../../../crypto/keys';
import { Destination } from '../../../types/destination';
import { decodeObjective } from './memstore';
import { VirtualChannel } from '../../../channel/virtual';

export class DurableStore implements Store {
  private objectives?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private consensusChannels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channelToObjective?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, string>;

  private vouchers?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  // the signing key of the store's engine
  private key: string = '';

  // the (Ethereum) address associated to the signing key
  private address: string = '';

  // the location where the store's data is stored
  private location: string = '';

  private db?: Level<string, Buffer>;

  // NewDurableStore creates a new DurableStore that uses the given location to store its data
  // In NodeJS, location must be a directory path where LevelDB will store its files
  // In browsers, location is the name of the IDBDatabase to be opened.
  static newDurableStore(key: Buffer, location: string): Store {
    const ps = new DurableStore();
    ps.key = bytes2Hex(key);
    ps.address = getAddressFromSecretKeyBytes(key);
    ps.location = location;

    ps.db = new Level<string, Buffer>(location, { valueEncoding: 'buffer' });

    ps.objectives = ps.openDB('objectives');
    ps.channels = ps.openDB('channels');
    ps.consensusChannels = ps.openDB('consensus_channels');
    ps.channelToObjective = ps.openDB<string>('channel_to_objective');
    ps.vouchers = ps.openDB('vouchers');

    return ps;
  }

  private openDB<V = Buffer>(name: string): AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, V> {
    let subDb;
    try {
      subDb = this.db!.sublevel<string, V>(name, { valueEncoding: 'buffer' });
    } catch (err) {
      this.checkError(err as Error);
      assert(subDb);
    }

    return subDb;
  }

  async close(): Promise<void> {
    const err: Error | null | undefined = await new Promise((resolve) => {
      // Promisify callback close method
      this.db!.close((res) => {
        resolve(res);
      });
    });

    if (err) {
      throw err;
    }
  }

  getAddress(): Address {
    return this.address;
  }

  getChannelSecretKey(): Buffer {
    const val = hex2Bytes(this.key);
    return val;
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
      this.populateChannelData(obj);
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
          this.checkError(err as Error);
        }
      }

      if (isOwned && prevOwner !== obj.id()) {
        throw new Error(`cannot transfer ownership of channel from objective ${prevOwner} to ${obj.id()}`);
      }
    }
  }

  // SetChannel sets the channel in the store.
  setChannel(ch: Channel): void {
    // TODO: Implement
  }

  // destroyChannel deletes the channel with id id.
  destroyChannel(id: Destination): void {
    // TODO: Implement
  }

  // SetConsensusChannel sets the channel in the store.
  setConsensusChannel(ch: ConsensusChannel): void {
    // TODO: Implement
  }

  // DestroyChannel deletes the channel with id id.
  destroyConsensusChannel(id: Destination): void {
    // TODO: Implement
  }

  getChannelById(id: Destination): [Channel, boolean] {
    // TODO: Implement
    return [new Channel({}), false];
  }

  private _getChannelById(id: Destination): Channel {
    // TODO: Implement
    return new Channel({});
  }

  // GetChannelsByIds returns a collection of channels with the given ids
  getChannelsByIds(ids: string[]): Channel[] {
    // TODO: Implement
    return [];
  }

  // GetChannelsByAppDefinition returns any channels that include the given app definition
  getChannelsByAppDefinition(appDef: Address): Channel[] {
    // TODO: Implement
    return [];
  }

  // GetChannelsByParticipant returns any channels that include the given participant
  getChannelsByParticipant(participant: Address): Channel[] {
    // TODO: Implement
    return [];
  }

  // GetConsensusChannelById returns a ConsensusChannel with the given channel id
  getConsensusChannelById(id: Destination): ConsensusChannel {
    // TODO: Implement
    return new ConsensusChannel({});
  }

  // getConsensusChannel returns a ConsensusChannel between the calling client and
  // the supplied counterparty, if such channel exists
  getConsensusChannel(counterparty: Address): [ConsensusChannel | undefined, boolean] {
    // TODO: Implement
    return [undefined, false];
  }

  getAllConsensusChannels(): ConsensusChannel[] {
    // TODO: Implement
    return [];
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
  populateChannelData(obj: Objective): void {
    // TODO: Implement
  }

  releaseChannelFromOwnership(channelId: Destination): void {
    // TODO: Implement
  }

  // checkError is a helper function that panics if an error is not nil
  // TODO: Longer term we should return errors instead of panicking
  private checkError(err: Error) {
    if (err) {
      throw err;
    }
  }

  setVoucherInfo(channelId: Destination, v: VoucherInfo): void {
    // TODO: Implement
  }

  getVoucherInfo(channelId: Destination): [VoucherInfo | undefined, boolean] {
    // TODO: Implement
    return [undefined, false];
  }

  removeVoucherInfo(channelId: Destination): void {
    // TODO: Implement
  }
}
