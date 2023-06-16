import assert from 'assert';

import Channel, { ReadWriteChannel } from '@nodeguy/channel';
import {
  FieldDescription,
  fromJSON,
  toJSON,
  zeroValueSignature,
} from '@cerc-io/nitro-util';

import { Destination } from '../../types/destination';
import { Address } from '../../types/types';
import * as channel from '../../channel/channel';
import { VirtualChannel } from '../../channel/virtual';
import { ConsensusChannel, Proposal, SignedProposal } from '../../channel/consensus-channel/consensus-channel';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  SideEffects,
  WaitingFor,
  Storable,
  ObjectiveStatus,
  ProposalReceiver,
} from '../interfaces';
import {
  Message, ObjectiveId, ObjectivePayload, PayloadType,
} from '../messages';
import { SignedState } from '../../channel/state/signedstate';
import { SingleAssetExit, Exit } from '../../channel/state/outcome/exit';
import {
  FixedPart, VariablePart, Signature, stateFromFixedAndVariablePart, State,
} from '../../channel/state/state';
import { equal } from '../../crypto/signatures';

const WaitingForFinalStateFromAlice: WaitingFor = 'WaitingForFinalStateFromAlice';
const WaitingForSupportedFinalState: WaitingFor = 'WaitingForSupportedFinalState'; // Round 1
const WaitingForDefundingOnMyLeft: WaitingFor = 'WaitingForDefundingOnMyLeft'; // Round 2
const WaitingForDefundingOnMyRight: WaitingFor = 'WaitingForDefundingOnMyRight'; // Round 2
const WaitingForNothing: WaitingFor = 'WaitingForNothing'; // Finished

// SignedStatePayload indicates that the payload is a json serialized signed state
const SignedStatePayload: PayloadType = 'SignedStatePayload';
// RequestFinalStatePayload indicates that the payload is a request for the final state
// The actual payload is simply the channel id that the final state is for
const RequestFinalStatePayload: PayloadType = 'RequestFinalStatePayload';

// The turn number used for the final state
const FinalTurnNum = 2;

export const ObjectivePrefix = 'VirtualDefund-';

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
type GetChannelByIdFunction = (id: Destination) => [channel.Channel | undefined, boolean];

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
type GetTwoPartyConsensusLedgerFunction = (counterparty: Address) => [ConsensusChannel | undefined, boolean];

// TODO: Implement
// getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
export function getSignedStatePayload(b: Buffer): SignedState {
  return {} as SignedState;
}

// TODO: Implement
// getRequestFinalStatePayload takes in a serialized channel id payload and returns the deserialized channel id.
export function getRequestFinalStatePayload(b: Buffer): Destination {
  return {} as Destination;
}

// validateFinalOutcome is a helper function that validates a final outcome from Alice is valid.
export function validateFinalOutcome(
  vFixed: FixedPart,
  initialOutcome: SingleAssetExit,
  finalOutcome: SingleAssetExit,
  me: Address,
  minAmount: bigint,
): void {
  // Check the outcome participants are correct
  const alice = vFixed.participants[0];
  const bob = vFixed.participants[vFixed.participants.length - 1];

  if (initialOutcome.allocations.value[0].destination !== Destination.addressToDestination(alice)) {
    throw new Error(`0th allocation is not to Alice but to ${initialOutcome.allocations.value[0].destination}`);
  }
  if (initialOutcome.allocations.value[1].destination !== Destination.addressToDestination(bob)) {
    throw new Error(`1st allocation is not to Bob but to ${initialOutcome.allocations.value[0].destination}`);
  }

  // Check the amounts are correct
  const initialAliceAmount = initialOutcome.allocations.value[0].amount;
  const initialBobAmount = initialOutcome.allocations.value[1].amount;
  const finalAliceAmount = finalOutcome.allocations.value[0].amount;
  const finalBobAmount = finalOutcome.allocations.value[1].amount;
  const paidToBob = finalBobAmount - finalAliceAmount;
  const paidFromAlice = initialAliceAmount - finalAliceAmount;

  if (paidToBob !== paidFromAlice) {
    throw new Error(`final outcome is not balanced: Alice paid ${paidFromAlice}, Bob received ${paidToBob}`);
  }

  // if we're Bob we want to make sure the final state Alice sent is equal to or larger than the payment we already have
  if (me === bob) {
    if (paidToBob < minAmount) {
      throw new Error(`payment amount ${paidToBob} is less than the minimum payment amount ${minAmount}`);
    }
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

export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  // MinimumPaymentAmount is the latest payment amount we have received from Alice before starting defunding.
  // This is set by Bob so he can ensure he receives the latest amount from any vouchers he's received.
  // If this is not set then virtual defunding will accept any final outcome from Alice.
  minimumPaymentAmount: bigint = BigInt(0);

  v?: VirtualChannel;

  toMyLeft?: ConsensusChannel;

  toMyRight?: ConsensusChannel;

  // MyRole is the index of the participant in the participants list
  // 0 is Alice
  // 1...n is Irene, Ivan, ... (the n intermediaries)
  // n+1 is Bob
  myRole: number = 0;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    minimumPaymentAmount: { type: 'bigint' },
    v: { type: 'class', value: VirtualChannel },
    toMyLeft: { type: 'class', value: ConsensusChannel },
    toMyRight: { type: 'class', value: ConsensusChannel },
    myRole: { type: 'number' },
  };

  static fromJSON(data: string): Objective {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Objective(props);
  }

  toJSON(): any {
    return toJSON(Objective.jsonEncodingMap, this);
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
  static constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    myAddress: Address,
    getChannel: GetChannelByIdFunction,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
    latestVoucherAmount: bigint = BigInt(0),
  ): Objective {
    // if latestVoucherAmount == nil {
    //   latestVoucherAmount = big.NewInt(0)
    // }

    let cId: Destination;
    let err: Error;

    switch (p.type) {
      case RequestFinalStatePayload: {
        try {
          cId = getRequestFinalStatePayload(p.payloadData);
        } catch (handleError) {
          err = handleError as Error;
        }
        break;
      }

      case SignedStatePayload: {
        let ss: SignedState;
        try {
          ss = getSignedStatePayload(p.payloadData);
        } catch (handleError) {
          err = handleError as Error;
        }
        cId = ss!.channelId();
        break;
      }

      default:
        throw new Error(`unknown payload type ${p.type}`);
    }

    if (err!) {
      throw err;
    }

    return this.newObjective(
      ObjectiveRequest.newObjectiveRequest(cId!),
      preapprove,
      myAddress,
      latestVoucherAmount,
      getChannel,
      getTwoPartyConsensusLedger,
    );
  }

  // TODO: Implement
  private generateFinalOutcome(): SingleAssetExit {
    return {} as SingleAssetExit;
  }

  // finalState returns the final state for the virtual channel
  private generateFinalState(): State {
    const vp = new VariablePart({ outcome: new Exit([this.generateFinalOutcome()]), turnNum: FinalTurnNum, isFinal: true });
    return stateFromFixedAndVariablePart(this.v!, vp);
  }

  id(): ObjectiveId {
    const id = this.vId().string();
    return `${ObjectivePrefix}${id}`;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  approve(): Objective {
    const updated = this.clone();
    // todo: consider case of s.Status == Rejected
    updated.status = ObjectiveStatus.Approved;

    return updated;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  reject(): [Objective, SideEffects] {
    const updated = this.clone();
    updated.status = ObjectiveStatus.Rejected;

    const peers: Address[] = [];
    for (const [i, peer] of this.v!.participants.entries()) {
      if (i !== this.myRole) {
        peers.push(peer);
      }
    }

    const message = Message.createRejectionNoticeMessage(this.id(), ...peers);
    const sideEffects = new SideEffects({ messagesToSend: message });
    return [updated, sideEffects];
  }

  // OwnsChannel returns the channel the objective exclusively owns.
  ownsChannel(): Destination {
    return this.vId();
  }

  // GetStatus returns the status of the objective.
  getStatus(): ObjectiveStatus {
    return this.status;
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  related(): Storable[] {
    const related: Storable[] = [];
    related.push(this.v!);

    if (this.toMyLeft !== null) {
      related.push(this.toMyLeft!);
    }
    if (this.toMyRight !== null) {
      related.push(this.toMyRight!);
    }

    return related;
  }

  // Clone returns a deep copy of the receiver.
  private clone(): Objective {
    const clone = new Objective({});
    clone.status = this.status;
    clone.v = this.v!.clone();

    if (this.minimumPaymentAmount !== null) {
      clone.minimumPaymentAmount = BigInt(this.minimumPaymentAmount!);
    }
    clone.myRole = this.myRole;
    // TODO: Properly clone the consensus channels

    if (this.toMyLeft !== null) {
      clone.toMyLeft = this.toMyLeft;
    }

    if (this.toMyRight !== null) {
      clone.toMyRight = this.toMyRight;
    }

    return clone;
  }

  // otherParticipants returns the participants in the channel that are not the current participant.
  private otherParticipants(): Address[] {
    const others: Address[] = [];
    for (let i = 0; i < this.v!.participants.length; i += 1) {
      if (i !== this.myRole) {
        others.push(this.v!.participants[i]);
      }
    }
    return others;
  }

  // TODO: Implement
  private hasFinalStateFromAlice(): boolean {
    return false;
  }

  // Crank inspects the extended state and declares a list of Effects to be executed.
  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
  // TODO: Can throw an error
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    return [new Objective({}), new SideEffects({}), ''];
  }

  // isAlice returns true if the receiver represents participant 0 in the virtualdefund protocol.
  private isAlice(): boolean {
    return this.myRole === 0;
  }

  // isBob returns true if the receiver represents participant n+1 in the virtualdefund protocol.
  private isBob(): boolean {
    return this.myRole === this.v!.participants.length - 1;
  }

  // ledgerProposal generates a ledger proposal to remove the guarantee for V for ledger
  // TODO: Implement
  private ledgerProposal(ledger: ConsensusChannel): Proposal {
    return {} as Proposal;
  }

  // updateLedgerToRemoveGuarantee updates the ledger channel to remove the guarantee that funds V.
  // TODO: Implement
  private updateLedgerToRemoveGuarantee(ledger: ConsensusChannel, sk: Buffer): SideEffects {
    return {} as SideEffects;
  }

  // VId returns the channel id of the virtual channel.
  vId(): Destination {
    return this.v!.channelId();
  }

  // rightHasDefunded returns whether the ledger channel ToMyRight has removed
  // its funding for the target channel.
  //
  // If ToMyRight==nil then we return true.
  private rightHasDefunded(): boolean {
    if (this.toMyRight === null) {
      return true;
    }

    const included = this.toMyRight!.includesTarget(this.vId());
    return !included;
  }

  // leftHasDefunded returns whether the ledger channel ToMyLeft has removed
  // its funding for the target channel.
  //
  // If ToMyLeft==nil then we return true.
  private leftHasDefunded(): boolean {
    if (this.toMyLeft === null) {
      return true;
    }

    const included = this.toMyLeft!.includesTarget(this.vId());
    return !included;
  }

  // Update receives an protocols.ObjectiveEvent, applies all applicable event data to the VirtualDefundObjective,
  // and returns the updated state.
  update(op: ObjectivePayload): Objective {
    if (this.id() !== op.objectiveId) {
      throw new Error(`event and objective Ids do not match: ${op.objectiveId} and ${this.id()} respectively`);
    }

    switch (op.type) {
      case SignedStatePayload: {
        const ss = getSignedStatePayload(op.payloadData);
        const updated = this.clone();
        try {
          validateFinalOutcome(
            updated.v!,
            updated.initialOutcome(),
            ss.state().outcome.value[0],
            this.v!.participants[this.myRole],
            updated.minimumPaymentAmount!,
          );
        } catch (err) {
          throw new Error(`outcome failed validation ${err}`);
        }

        const ok = updated.v!.addSignedState(ss);
        if (!ok) {
          throw new Error(`could not add signed state ${ss}`);
        }
        return updated;
      }

      case RequestFinalStatePayload: {
        // Since the objective is already created we don't need to do anything else with the payload
        return new Objective({});
      }

      default:
        throw new Error(`unknown payload type ${op.type}`);
    }
  }

  // ReceiveProposal receives a signed proposal and returns an updated VirtualDefund objective.
  // TODO: Implement
  receiveProposal(sp: SignedProposal): ProposalReceiver {
    let toMyLeftId: Destination;
    let toMyRightId: Destination;

    if (this.toMyLeft !== null) {
      toMyLeftId = this.toMyLeft!.id;
    }
    if (this.toMyRight !== null) {
      toMyRightId = this.toMyRight!.id;
    }

    const updated = this.clone();

    if (sp.proposal.target() === this.vId()) {
      let err: Error | undefined;

      switch (true) {
        case _.isEqual(sp.proposal.ledgerID, new Destination()): {
          throw new Error('signed proposal is for a zero-addressed ledger channel');
        // catch this case to avoid unspecified behaviour -- because if Alice or Bob we allow a null channel.
        }

        case _.isEqual(sp.proposal.ledgerID, toMyLeftId!): {
          try {
            updated.toMyLeft!.receive(sp);
          } catch (handleError) {
            err = handleError as Error;
          }
          break;
        }

        case _.isEqual(sp.proposal.ledgerID, toMyRightId!): {
          try {
            updated.toMyRight!.receive(sp);
          } catch (handleError) {
            err = handleError as Error;
          }
          break;
        }

        default:
          throw new Error('signed proposal is not addressed to a known ledger connection');
      }

      // Ignore stale or future proposals.
      if ((err as Error).message.includes(ErrInvalidTurnNum.message)) {
        return updated;
      }

      if (err) {
        throw new Error(`error incorporating signed proposal ${sp} into objective: ${err}`);
      }
    }
    return updated;
  }

  // isZero returns true if every byte field on the signature is zero
  private isZero(sig: Signature): boolean {
    return equal(sig, zeroValueSignature);
  }
}

// IsVirtualDefundObjective inspects a objective id and returns true if the objective id is for a virtualdefund objective.
export function isVirtualDefundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
}

// GetVirtualChannelFromObjectiveId gets the virtual channel id from the objective id.
export function getVirtualChannelFromObjectiveId(id: ObjectiveId): Destination {
  if (!id.startsWith(ObjectivePrefix)) {
    throw new Error(`id ${id} does not have prefix ${ObjectivePrefix}`);
  }
  const raw = id.slice(ObjectivePrefix.length);

  return new Destination(raw);
}
