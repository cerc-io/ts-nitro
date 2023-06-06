import Channel, { ReadWriteChannel } from '@nodeguy/channel';

import assert from 'assert';
import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import * as channel from '../../channel/channel';
import {
  ObjectiveRequest as ObjectiveRequestInterface, Objective as ObjectiveInterface, SideEffects, WaitingFor, Storable, ObjectiveStatus,
} from '../interfaces';
import { ObjectiveId, ObjectivePayload } from '../messages';
import { Address } from '../../types/types';

const ObjectivePrefix = 'DirectDefunding-';

// GetConsensusChannel describes functions which return a ConsensusChannel ledger channel for a channel id.
type GetConsensusChannel = (channelId: Destination) => ConsensusChannel | undefined;

// isInConsensusOrFinalState returns true if the channel has a final state or latest state that is supported
// TODO: Implement
const isInConsensusOrFinalState = (c: channel.Channel): boolean => false;

export class Objective implements ObjectiveInterface {
  // NewObjective initiates an Objective with the supplied channel
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    getConsensusChannel: GetConsensusChannel,
  ): Objective {
    // TODO: Implement
    return new Objective();
  }

  // TODO: Implement
  id(): ObjectiveId {
    return '';
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  approve(): Objective {
    return new Objective();
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  reject(): [Objective, SideEffects] {
    return [
      new Objective(),
      {
        messagesToSend: [],
        proposalsToProcess: [],
        transactionsToSubmit: [],
      },
    ];
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  update(payload: ObjectivePayload): Objective {
    return new Objective();
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    return [
      new Objective(),
      {
        messagesToSend: [],
        proposalsToProcess: [],
        transactionsToSubmit: [],
      },
      '',
    ];
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  // TODO: Implement
  related(): Storable[] {
    return [];
  }

  // OwnsChannel returns the channel the objective exclusively owns.
  // TODO: Implement
  ownsChannel(): Destination {
    return new Destination();
  }

  // GetStatus returns the status of the objective.
  // TODO: Implement
  getStatus(): ObjectiveStatus {
    return ObjectiveStatus.Unapproved;
  }
}

// createChannelFromConsensusChannel creates a Channel with (an appropriate latest supported state) from the supplied ConsensusChannel.
// TODO: Implement
const createChannelFromConsensusChannel = (cc: ConsensusChannel): channel.Channel => new channel.Channel({});

// ObjectiveRequest represents a request to create a new direct defund objective.
// TODO: Implement
export class ObjectiveRequest implements ObjectiveRequestInterface {
  channelId: Destination = new Destination();

  private objectiveStarted?: ReadWriteChannel<void>;

  constructor(params: {
    channelId?: Destination,
    objectiveStarted: ReadWriteChannel<void>
  }) {
    Object.assign(this, params);
  }

  // NewObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(channelId: Destination): ObjectiveRequest {
    return new ObjectiveRequest({
      channelId,
      objectiveStarted: Channel(),
    });
  }

  id(address: Address, chainId?: bigint): ObjectiveId {
    return ObjectivePrefix + this.channelId.string();
  }

  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  signalObjectiveStarted(): void {}
}
