import assert from 'assert';

import { bytes2Hex, hex2Bytes } from '@cerc-io/nitro-util';

import { ErrNoSuchChannel, Store } from './store';
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

export class MemStore implements Store {
  objectives: SafeSyncMap<Buffer>;

  channels: SafeSyncMap<Buffer>;

  consensusChannels: SafeSyncMap<Buffer>;

  channelToObjective: SafeSyncMap<ObjectiveId>;

  vouchers: SafeSyncMap<Buffer>;

  // the signing key of the store's engine
  key: string;

  // the (Ethereum) address associated to the signing key
  address: string;

  constructor(key: Buffer) {
    this.key = bytes2Hex(key);
    this.address = getAddressFromSecretKeyBytes(key);

    this.objectives = new SafeSyncMap();
    this.channels = new SafeSyncMap();
    this.consensusChannels = new SafeSyncMap();
    this.channelToObjective = new SafeSyncMap();
    this.vouchers = new SafeSyncMap();
  }

  // TODO: Implement
  close(): void {}

  getAddress(): Address {
    return this.address;
  }

  getChannelSecretKey(): Buffer {
    const val = hex2Bytes(this.key);
    return val;
  }

  // TODO: Implement
  getObjectiveById(): Objective {
    return {} as Objective;
  }

  public setObjective(obj: Objective): void {
    // todo: locking
    let objJSON: Buffer;
    try {
      objJSON = Buffer.from(JSON.stringify(obj), 'utf-8');
    } catch (err) {
      throw new Error(`error setting objective ${obj.id()}: ${err}`);
    }

    this.objectives.store(obj.id().toString(), objJSON);

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
    const [prevOwner, isOwned] = this.channelToObjective.load(obj.ownsChannel().toString());

    if (obj.getStatus() === ObjectiveStatus.Approved) {
      if (!prevOwner) {
        this.channelToObjective.store(obj.ownsChannel().toString(), obj.id());
      }
      if (isOwned && prevOwner !== obj.id().toString()) {
        throw new Error(`cannot transfer ownership of channel from objective ${prevOwner} to ${obj.id()}`);
      }
    }
  }

  public setChannel(ch: Channel): void {
    const chJSON = Buffer.from(JSON.stringify(ch), 'utf-8');

    this.channels.store(ch.id.toString(), chJSON);
  }

  // destroyChannel deletes the channel with id id.
  destroyChannel(id: Destination): void {
    this.channels.delete(id.string());
  }

  // TODO: Implement
  setConsensusChannel(ch: ConsensusChannel): void {
    if (ch.id.isZero()) {
      throw new Error('cannot store a channel with a zero id');
    }

    const chJSON = Buffer.from(JSON.stringify(ch), 'utf-8');

    this.consensusChannels.store(ch.id.toString(), chJSON);
  }

  // DestroyChannel deletes the channel with id id.
  destroyConsensusChannel(id: Destination): void {
    this.consensusChannels.delete(id.string());
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
    const [chJSON, ok] = this.channels.load(id.toString());

    if (!ok) {
      throw ErrNoSuchChannel;
    }

    assert(chJSON);

    const ch = new Channel({});

    try {
      ch.unmarshalJSON(chJSON);

      return ch;
    } catch (err) {
      throw new Error(`error unmarshaling channel ${ch.id}`);
    }
  }

  // TODO: Implement
  getChannelsByIds(ids: string[]): Channel[] {
    return [];
  }

  // TODO: Implement
  getChannelsByAppDefinition(appDef: Address): Channel[] {
    return [];
  }

  // GetChannelsByParticipant returns any channels that include the given participant
  getChannelsByParticipant(participant: Address): Channel[] {
    const toReturn: Channel[] = [];

    this.channels.range((key: string, chJSON: Buffer) => {
      let ch: Channel;
      try {
        ch = Channel.fromJSON(chJSON.toString());
      } catch (err) {
        return true; // channel not found, continue looking
      }

      const { participants } = ch;
      for (const p of participants) {
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
    const [chJSON, ok] = this.consensusChannels.load(id.string());

    if (!ok) {
      throw ErrNoSuchChannel;
    }
    assert(chJSON);

    const ch = new ConsensusChannel({});
    try {
      ch.unmarshalJSON(chJSON);
    } catch (err) {
      throw new Error(`error unmarshaling channel ${ch.id}`);
    }

    return ch;
  }

  // getConsensusChannel returns a ConsensusChannel between the calling client and
  // the supplied counterparty, if such channel exists
  getConsensusChannel(counterparty: Address): [ConsensusChannel | undefined, boolean] {
    let channel: ConsensusChannel | undefined;
    let ok = false;

    this.consensusChannels.range((key: string, chJSON: Buffer): boolean => {
      let ch = new ConsensusChannel({});
      try {
        // TODO: Implement json.Unmarshal
        ch = JSON.parse(chJSON.toString());
      } catch (error) {
        return true; // channel not found, continue looking
      }

      const participants = ch.participants();
      if (participants.length === 2) {
        if (participants[0] === counterparty || participants[1] === counterparty) {
          channel = ch;
          ok = true;
          return false; // we have found the target channel: break the forEach loop
        }
      }

      return true; // channel not found: continue looking
    });

    return [channel, ok];
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

  releaseChannelFromOwnership(channelId: Destination): void {
    this.channelToObjective.delete(channelId.string());
  }

  setVoucherInfo(channelId: Destination, v: VoucherInfo): void {
    // Implement json.Marshal
    const jsonData = Buffer.from(JSON.stringify(v));

    this.vouchers.store(channelId.string(), jsonData);
  }

  getVoucherInfo(channelId: Destination): [VoucherInfo | undefined, boolean] {
    const [data, ok] = this.vouchers.load(channelId.string());
    if (!ok) {
      return [undefined, false];
    }

    assert(data);

    try {
      // TODO: Implement json.Unmarshal
      const v = new VoucherInfo(JSON.parse(data.toString()));
      return [v, true];
    } catch (err) {
      return [undefined, false];
    }
  }

  // TODO: Implement
  removeVoucherInfo(channelId: Destination): void {}
}

// decodeObjective is a helper which encapsulates the deserialization
// of Objective JSON data. The decoded objectives will not have any
// channel data other than the channel Id.
// TODO: Can throw an error
// TODO: Implement
function decodeObjective(id: ObjectiveId, data: Buffer): Objective {
  return {} as Objective;
}
