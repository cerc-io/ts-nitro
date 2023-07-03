import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';
import { Level } from 'level';
import type { AbstractSublevel } from 'abstract-level';

import { bytes2Hex, hex2Bytes } from '@cerc-io/nitro-util';

import { Store } from './store';
import { Objective } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { ObjectiveId } from '../../../protocols/messages';
import { Address } from '../../../types/types';
import { getAddressFromSecretKeyBytes } from '../../../crypto/keys';
import { Destination } from '../../../types/destination';

export class DurableStore implements Store {
  private objectives?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private consensusChannels?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private channelToObjective?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  private vouchers?: AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer>;

  // the signing key of the store's engine
  private key: string = '';

  // the (Ethereum) address associated to the signing key
  private address: string = '';

  // the location where the store's data is stored
  private location: string = '';

  static newDurableStore(key: Buffer, location: string): Store {
    const ps = new DurableStore();
    ps.key = bytes2Hex(key);
    ps.address = getAddressFromSecretKeyBytes(key);
    ps.location = location;

    const db = new Level<string, Buffer>(location, { valueEncoding: 'buffer' });

    ps.objectives = ps.openDB(db, 'objectives');
    ps.channels = ps.openDB(db, 'channels');
    ps.consensusChannels = ps.openDB(db, 'consensus_channels');
    ps.channelToObjective = ps.openDB(db, 'channel_to_objective');
    ps.vouchers = ps.openDB(db, 'vouchers');

    return ps;
  }

  private openDB(db: Level<string, Buffer>, name: string): AbstractSublevel<Level<string, Buffer>, string | Buffer | Uint8Array, string, Buffer> {
    let subDb;
    try {
      subDb = db.sublevel<string, Buffer>(name, { valueEncoding: 'buffer' });
    } catch (err) {
      this.checkError(err as Error);
      assert(subDb);
    }

    return subDb;
  }

  close(): void {
    // TODO: Implement
  }

  getAddress(): Address {
    return this.address;
  }

  getChannelSecretKey(): Buffer {
    const val = hex2Bytes(this.key);
    return val;
  }

  getObjectiveById(id: ObjectiveId): Objective {
    // TODO: Implement
    return {} as Objective;
  }

  public setObjective(obj: Objective): void {
    // TODO: Implement
  }

  public setChannel(ch: Channel): void {
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

  getObjectiveByChannelId(channelId: Destination): [Objective | undefined, boolean] {
    // TODO: Implement
    return [undefined, false];
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
