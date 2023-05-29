import { bytes2Hex } from '@cerc-io/nitro-util';

import { ethers } from 'ethers';
import { Store } from './store';
import { Objective } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus-channel/consensus-channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { SyncMap } from '../../../internal/safesync/safesync';
import { ObjectiveId } from '../../../protocols/messages';
import { Address } from '../../../types/types';
import { getAddressFromSecretKeyBytes } from '../../../crypto/keys';

export class MemStore implements Store {
  obectives: SyncMap<Buffer>;

  channels: SyncMap<Buffer>;

  consensusChannels: SyncMap<Buffer>;

  channelToObjective: SyncMap<Objective>;

  vouchers: SyncMap<Buffer>;

  // the signing key of the store's engine
  key: string;

  // the (Ethereum) address associated to the signing key
  address: string;

  constructor(key: Buffer) {
    this.key = bytes2Hex(key);
    // TODO: Get address from key bytes
    this.address = getAddressFromSecretKeyBytes(key);

    this.obectives = new SyncMap();
    this.channels = new SyncMap();
    this.consensusChannels = new SyncMap();
    this.channelToObjective = new SyncMap();
    this.vouchers = new SyncMap();
  }

  // TODO: Implement
  close(): void {}

  getAddress(): Address {
    return this.address;
  }

  getChannelSecretKey(): Buffer {
    const val = ethers.utils.arrayify(this.key);
    return Buffer.from(val);
  }

  // TODO: Implement
  getObjectiveById(): Objective {
    return {} as Objective;
  }

  // TODO: Implement
  setObjective(obj: Objective): void {}

  // TODO: Implement
  setChannel(ch: Channel): void {}

  // TODO: Implement
  destroyChannel(id: string): void {}

  // TODO: Implement
  setConsensusChannel(ch: ConsensusChannel): void {}

  // TODO: Implement
  destroyConsensusChannel(id: string): void {}

  // TODO: Implement
  getChannelById(id: string): Channel {
    return {} as Channel;
  }

  // TODO: Implement
  private _getChannelById(id: string): Channel {
    return {} as Channel;
  }

  // TODO: Implement
  getChannelsByIds(ids: string[]): Channel[] {
    return [];
  }

  // TODO: Implement
  getChannelsByAppDefinition(appDef: Address): Channel[] {
    return [];
  }

  // TODO: Implement
  getChannelsByParticipant(participant: Address): Channel[] {
    return [];
  }

  // TODO: Implement
  getConsensusChannelById(id: string): ConsensusChannel {
    return {} as ConsensusChannel;
  }

  // TODO: Implement
  getConsensusChannel(counterparty: Address): [ConsensusChannel, boolean] {
    return [{} as ConsensusChannel, false];
  }

  // TODO: Implement
  getAllConsensusChannels(): ConsensusChannel[] {
    return [];
  }

  // TODO: Implement
  getObjectiveByChannelId(channelId: string): Objective {
    return {} as Objective;
  }

  // populateChannelData fetches stored Channel data relevant to the given
  // objective and attaches it to the objective. The channel data is attached
  // in-place of the objectives existing channel pointers.
  // TODO: Can throw an error
  // TODO: Implement
  populateChannelData(obj: Objective): void {}

  // TODO: Implement
  releaseChannelFromOwnership(channelId: string): void {}

  // TODO: Implement
  setVoucherInfo(channelId: string, v: VoucherInfo): void {}

  // TODO: Implement
  getVoucherInfo(channelId: string): VoucherInfo {
    return {} as VoucherInfo;
  }

  // TODO: Implement
  removeVoucherInfo(channelId: string): void {}
}

// decodeObjective is a helper which encapsulates the deserialization
// of Objective JSON data. The decoded objectives will not have any
// channel data other than the channel Id.
// TODO: Can throw an error
// TODO: Implement
function decodeObjective(id: ObjectiveId, data: Buffer): Objective {
  return {} as Objective;
}
