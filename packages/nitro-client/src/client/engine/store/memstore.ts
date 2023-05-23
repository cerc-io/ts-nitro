import { AddressLike, ethers } from 'ethers';

import { Store } from './store';
import { Objective, ObjectiveId } from '../../../protocols/interfaces';
import { Channel } from '../../../channel/channel';
import { ConsensusChannel } from '../../../channel/consensus_channel/consensus_channel';
import { VoucherInfo } from '../../../payments/vouchers';
import { SyncMap } from '../../../internal/safesync/safesync';

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
    this.key = key.toString();
    // TODO: Get address from key bytes
    this.address = '';

    this.obectives = new SyncMap();
    this.channels = new SyncMap();
    this.consensusChannels = new SyncMap();
    this.channelToObjective = new SyncMap();
    this.vouchers = new SyncMap();
  }

  // TODO: Implement
  close(): void {}

  // TODO: Implement
  getAddress(): AddressLike {
    return ethers.ZeroAddress;
  }

  // TODO: Implement
  getChannelSecretKey(): string {
    return '';
  }

  // TODO: Implement
  getObjectiveById(): Objective {
    return {};
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
    return new Channel();
  }

  // TODO: Implement
  private _getChannelById(id: string): Channel {
    return new Channel();
  }

  // TODO: Implement
  getChannelsByIds(ids: string[]): Channel[] {
    return [];
  }

  // TODO: Implement
  getChannelsByAppDefinition(appDef: AddressLike): Channel[] {
    return [];
  }

  // TODO: Implement
  getChannelsByParticipant(participant: AddressLike): Channel[] {
    return [];
  }

  // TODO: Implement
  getConsensusChannelById(id: string): ConsensusChannel {
    return {};
  }

  // TODO: Implement
  getConsensusChannel(counterparty: AddressLike): ConsensusChannel {
    return {};
  }

  // TODO: Implement
  getAllConsensusChannels(): ConsensusChannel[] {
    return [];
  }

  // TODO: Implement
  getObjectiveByChannelId(channelId: string): Objective {
    return {};
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
    return {};
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
  return {};
}
