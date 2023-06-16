import assert from 'assert';

import Channel, { ReadWriteChannel } from '@nodeguy/channel';

import { Destination } from '../../types/destination';
import { Address } from '../../types/types';
import * as channel from '../../channel/channel';
import { VirtualChannel } from '../../channel/virtual';
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

export const ObjectivePrefix = 'VirtualDefund-';

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
type GetChannelByIdFunction = (id: Destination) => [ channel.Channel | undefined, boolean ];

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
type GetTwoPartyConsensusLedgerFunction = (counterparty: Address) => [ ConsensusChannel | undefined, boolean ];

export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  // MinimumPaymentAmount is the latest payment amount we have received from Alice before starting defunding.
  // This is set by Bob so he can ensure he receives the latest amount from any vouchers he's received.
  // If this is not set then virtual defunding will accept any final outcome from Alice.
  minimumPaymentAmount?: bigint;

  v?: VirtualChannel;

  toMyLeft?: ConsensusChannel;

  toMyRight?: ConsensusChannel;

  // MyRole is the index of the participant in the participants list
  // 0 is Alice
  // 1...n is Irene, Ivan, ... (the n intermediaries)
  // n+1 is Bob
  myRole: number = 0;

  // TODO: Implement
  static fromJSON(data: string): Objective {
    return {} as Objective;
  }

  constructor(params: {
    status?: ObjectiveStatus,
    minimumPaymentAmount?: bigint,
    v?: VirtualChannel,
    toMyLeft?: ConsensusChannel,
    toMyRight?: ConsensusChannel,
    myRole?: number
  }) {
    Object.assign(this, params);
  }

  // NewObjective constructs a new virtual defund objective
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    largestPaymentAmount: bigint,
    getChannel: GetChannelByIdFunction,
    getConsensusChannel: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    let status: ObjectiveStatus;

    if (preApprove) {
      status = ObjectiveStatus.Approved;
    } else {
      status = ObjectiveStatus.Unapproved;
    }

    const [c, found] = getChannel(request.channelId);

    if (!found) {
      throw new Error(`Could not find channel ${request.channelId}`);
    }

    const v = new VirtualChannel({ ...c });
    const alice = v.participants[0];
    const bob = v.participants[v.participants.length - 1];

    let leftLedger: ConsensusChannel | undefined;
    let rightLedger: ConsensusChannel | undefined;
    let ok: boolean;

    if (myAddress === alice) {
      const rightOfAlice = v.participants[1];
      [rightLedger, ok] = getConsensusChannel(rightOfAlice);

      if (!ok) {
        throw new Error(`Could not find a ledger channel between ${alice} and ${rightOfAlice}`);
      }
    } else if (myAddress === bob) {
      const leftOfBob = v.participants[v.participants.length - 2];
      [leftLedger, ok] = getConsensusChannel(leftOfBob);

      if (!ok) {
        throw new Error(`Could not find a ledger channel between ${leftOfBob} and ${bob}`);
      }
    } else {
      const intermediaries = v.participants.slice(1, -1);
      let foundMyself = false;

      for (let i = 0; i < intermediaries.length; i += 1) {
        const intermediary = intermediaries[i];

        if (myAddress === intermediary) {
          foundMyself = true;
          // I am intermediary `i` and participant `p`
          const p = i + 1; // participants[p] === intermediaries[i]
          const leftOfMe = v.participants[p - 1];
          const rightOfMe = v.participants[p + 1];

          [leftLedger, ok] = getConsensusChannel(leftOfMe);

          if (!ok) {
            throw new Error(`Could not find a ledger channel between ${leftOfMe} and ${myAddress}`);
          }

          [rightLedger, ok] = getConsensusChannel(rightOfMe);

          if (!rightLedger) {
            throw new Error(`Could not find a ledger channel between ${myAddress} and ${rightOfMe}`);
          }

          break;
        }
      }

      if (!foundMyself) {
        throw new Error('Client address not found in an expected participant index');
      }
    }

    if (!largestPaymentAmount) {
      // eslint-disable-next-line no-param-reassign
      largestPaymentAmount = BigInt(0);
    }

    return new Objective({
      status,
      minimumPaymentAmount: largestPaymentAmount,
      v,
      myRole: v.myIndex,
      toMyLeft: leftLedger,
      toMyRight: rightLedger,
    });
  }

  // ConstructObjectiveFromPayload takes in a message payload and constructs an objective from it.
  // TODO: Can throw an error
  // TODO: Implement
  static constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    myAddress: Address,
    getChannel: GetChannelByIdFunction,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
    latestVoucherAmount: bigint,
  ): Objective {
    return {} as Objective;
  }

  // TODO: Implement
  id(): ObjectiveId {
    return '';
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  approve(): Objective {
    return new Objective({});
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  // TODO: Implement
  reject(): [Objective, SideEffects] {
    return [
      new Objective({}),
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
    return new Objective({});
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
  // TODO: Can throw an error
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    return [
      new Objective({}),
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

// IsVirtualDefundObjective inspects a objective id and returns true if the objective id is for a virtualdefund objective.
export function isVirtualDefundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
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

  id(address: Address, chainId?: bigint): ObjectiveId {
    return ObjectivePrefix + this.channelId.string();
  }

  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  signalObjectiveStarted(): void {
    assert(this.objectiveStarted);
    this.objectiveStarted.close();
  }
}

// GetVirtualChannelFromObjectiveId gets the virtual channel id from the objective id.
export function getVirtualChannelFromObjectiveId(id: ObjectiveId): Destination {
  if (!id.startsWith(ObjectivePrefix)) {
    throw new Error(`id ${id} does not have prefix ${ObjectivePrefix}`);
  }
  const raw = id.slice(ObjectivePrefix.length);

  return new Destination(raw);
}
