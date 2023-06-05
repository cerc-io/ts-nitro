import assert from 'assert';

import Channel, { ReadWriteChannel } from '@nodeguy/channel';

import { Destination } from '../../types/destination';
import { Address } from '../../types/types';
import * as channel from '../../channel/channel';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  SideEffects,
  WaitingFor,
  Storable,
  ObjectiveStatus,
} from '../interfaces';
import { ObjectiveId, ObjectivePayload } from '../messages';

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
type GetChannelByIdFunction = (id: Destination) => [ channel.Channel | undefined, boolean ];

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
type GetTwoPartyConsensusLedgerFunction = (counterparty: Address) => [ ConsensusChannel | undefined, boolean ];

export class Objective implements ObjectiveInterface {
  // NewObjective constructs a new virtual defund objective
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    largestPaymentAmount: bigint,
    getChannel: GetChannelByIdFunction,
    getConsensusChannel: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
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
  // TODO: Can throw an error
  update(payload: ObjectivePayload): Objective {
    return new Objective();
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
  // TODO: Can throw an error
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

// ObjectiveRequest represents a request to create a new virtual defund objective.
// TODO: Implement
export class ObjectiveRequest implements ObjectiveRequestInterface {
  channelId: Destination = new Destination();

  private objectiveStarted?: ReadWriteChannel<void>;

  constructor(params: {
    channelId?: Destination;
    objectiveStarted?: ReadWriteChannel<void>;
  }) {
    Object.assign(this, params);
  }

  // NewObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(channelId: Destination): ObjectiveRequest {
    return new ObjectiveRequest({
      channelId,
      objectiveStarted: Channel(), // Initialize as an unresolved promise
    });
  }

  // TODO: Implement
  id(address: Address, chainId?: bigint): ObjectiveId {
    return '';
  }

  // TODO: Implement
  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  // TODO: Implement
  signalObjectiveStarted(): void {}
}
