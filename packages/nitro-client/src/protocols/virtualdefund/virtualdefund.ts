import assert from 'assert';
import _ from 'lodash';
import { Buffer } from 'buffer';

import Channel, { ReadWriteChannel } from '@cerc-io/ts-channel';
import {
  FieldDescription,
  JSONbigNative,
  NitroSigner,
  Uint,
  Uint64,
  fromJSON,
  toJSON,
  zeroValueSignature,
} from '@cerc-io/nitro-util';

import { Destination } from '../../types/destination';
import { Address } from '../../types/types';
import * as channel from '../../channel/channel';
import { VirtualChannel } from '../../channel/virtual';
import {
  ConsensusChannel, Proposal, SignedProposal, ErrInvalidTurnNum,
} from '../../channel/consensus-channel/consensus-channel';
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
const FinalTurnNum: Uint64 = BigInt(2);

export const ObjectivePrefix = 'VirtualDefund-';

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
type GetChannelByIdFunction = (id: Destination) => [channel.Channel | undefined, boolean] | Promise<[channel.Channel | undefined, boolean]>;

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
type GetTwoPartyConsensusLedgerFunction = (counterparty: Address) => [ConsensusChannel | undefined, boolean] |
Promise<[ConsensusChannel | undefined, boolean]>;

// getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
export function getSignedStatePayload(b: Buffer): SignedState {
  let ss:SignedState;
  try {
    ss = SignedState.fromJSON(b.toString());
  } catch (err) {
    throw new Error(`could not unmarshal signed state: ${err}`);
  }
  return ss;
}

// getRequestFinalStatePayload takes in a serialized channel id payload and returns the deserialized channel id.
export function getRequestFinalStatePayload(b: Buffer): Destination {
  let cId: Destination;
  try {
    cId = Destination.fromJSON(b.toString());
  } catch (err) {
    throw new Error(`could not unmarshal signatures: ${err}`);
  }
  return cId;
}

// validateFinalOutcome is a helper function that validates a final outcome from Alice is valid.
export function validateFinalOutcome(
  vFixed: FixedPart,
  initialOutcome: SingleAssetExit,
  finalOutcome: SingleAssetExit,
  me: Address,
  minAmount?: bigint,
): void {
  // Check the outcome participants are correct
  const alice = vFixed.participants![0];
  const bob = vFixed.participants![vFixed.participants!.length - 1];

  if (!_.isEqual(initialOutcome.allocations.value![0].destination, Destination.addressToDestination(alice))) {
    throw new Error(`0th allocation is not to Alice but to ${initialOutcome.allocations.value![0].destination}`);
  }
  if (!_.isEqual(initialOutcome.allocations.value![1].destination, Destination.addressToDestination(bob))) {
    throw new Error(`1st allocation is not to Bob but to ${initialOutcome.allocations.value![0].destination}`);
  }

  // Check the amounts are correct
  const initialAliceAmount = initialOutcome.allocations.value![0].amount;
  const initialBobAmount = initialOutcome.allocations.value![1].amount;
  const finalAliceAmount = finalOutcome.allocations.value![0].amount;
  const finalBobAmount = finalOutcome.allocations.value![1].amount;
  const paidToBob = BigInt(finalBobAmount!) - BigInt(initialBobAmount!);
  const paidFromAlice = BigInt(initialAliceAmount!) - BigInt(finalAliceAmount!);

  if (paidToBob !== paidFromAlice) {
    throw new Error(`final outcome is not balanced: Alice paid ${paidFromAlice}, Bob received ${paidToBob}`);
  }

  // if we're Bob we want to make sure the final state Alice sent is equal to or larger than the payment we already have
  if (me === bob) {
    if (paidToBob < BigInt(minAmount!)) {
      throw new Error(`payment amount ${paidToBob} is less than the minimum payment amount ${minAmount}`);
    }
  }
}

// ObjectiveRequest represents a request to create a new virtual defund objective.
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
  minimumPaymentAmount?: bigint = undefined;

  v?: VirtualChannel;

  toMyLeft?: ConsensusChannel;

  toMyRight?: ConsensusChannel;

  // MyRole is the index of the participant in the participants list
  // 0 is Alice
  // 1...n is Irene, Ivan, ... (the n intermediaries)
  // n+1 is Bob
  myRole: Uint = BigInt(0);

  // NOTE: Marshal -> Unmarshal is a lossy process. All channel data from
  // the virtual and ledger channels (other than Ids) is discarded
  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    v: { type: 'class', value: Destination },
    toMyLeft: { type: 'class', value: Destination },
    toMyRight: { type: 'class', value: Destination },
    minimumPaymentAmount: { type: 'bigint' },
    myRole: { type: 'uint' },
  };

  static fromJSON(data: string): Objective {
    // props has v.id as v and
    // toMyLeft.id as toMyLeft and
    // toMyRight.id as toMyRight
    const props = fromJSON(this.jsonEncodingMap, data);

    return new Objective({
      status: props.status,
      minimumPaymentAmount: props.minimumPaymentAmount,
      v: new VirtualChannel({ id: props.v }),
      toMyLeft: _.isEqual(props.toMyLeft, new Destination()) ? undefined : new ConsensusChannel({ id: props.toMyLeft }),
      toMyRight: _.isEqual(props.toMyRight, new Destination()) ? undefined : new ConsensusChannel({ id: props.toMyRight }),
      myRole: props.myRole,
    });
  }

  toJSON(): any {
    // Use a custom object
    // (according to MarshalJSON implementation in go-nitro)

    const left = this.toMyLeft ? this.toMyLeft.id : new Destination();
    const right = this.toMyRight ? this.toMyRight.id : new Destination();

    const jsonObjective = {
      status: this.status,
      v: this.vId(),
      toMyLeft: left,
      toMyRight: right,
      minimumPaymentAmount: this.minimumPaymentAmount,
      myRole: this.myRole,
    };

    return toJSON(Objective.jsonEncodingMap, jsonObjective);
  }

  constructor(params: {
    status?: ObjectiveStatus,
    minimumPaymentAmount?: bigint,
    v?: VirtualChannel,
    toMyLeft?: ConsensusChannel,
    toMyRight?: ConsensusChannel,
    myRole?: Uint
  }) {
    Object.assign(this, params);
  }

  // NewObjective constructs a new virtual defund objective
  static async newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    largestPaymentAmount: bigint | undefined,
    getChannel: GetChannelByIdFunction,
    getConsensusChannel: GetTwoPartyConsensusLedgerFunction,
  ): Promise<Objective> {
    let status: ObjectiveStatus;

    if (preApprove) {
      status = ObjectiveStatus.Approved;
    } else {
      status = ObjectiveStatus.Unapproved;
    }

    const [c, found] = await getChannel(request.channelId);

    if (!found) {
      throw new Error(`Could not find channel ${request.channelId}`);
    }

    const v = new VirtualChannel({ ...c });
    const alice = v.participants![0];
    const bob = v.participants![v.participants!.length - 1];

    let leftLedger: ConsensusChannel | undefined;
    let rightLedger: ConsensusChannel | undefined;
    let ok: boolean;

    if (myAddress === alice) {
      const rightOfAlice = v.participants![1];
      [rightLedger, ok] = await getConsensusChannel(rightOfAlice);

      if (!ok) {
        throw new Error(`Could not find a ledger channel between ${alice} and ${rightOfAlice}`);
      }
    } else if (myAddress === bob) {
      const leftOfBob = v.participants![v.participants!.length - 2];
      [leftLedger, ok] = await getConsensusChannel(leftOfBob);

      if (!ok) {
        throw new Error(`Could not find a ledger channel between ${leftOfBob} and ${bob}`);
      }
    } else {
      const intermediaries = v.participants!.slice(1, -1);
      let foundMyself = false;

      for (let i = 0; i < intermediaries.length; i += 1) {
        const intermediary = intermediaries[i];

        if (myAddress === intermediary) {
          foundMyself = true;
          // I am intermediary `i` and participant `p`
          const p = i + 1; // participants[p] === intermediaries[i]
          const leftOfMe = v.participants![p - 1];
          const rightOfMe = v.participants![p + 1];

          // eslint-disable-next-line no-await-in-loop
          [leftLedger, ok] = await getConsensusChannel(leftOfMe);

          if (!ok) {
            throw new Error(`Could not find a ledger channel between ${leftOfMe} and ${myAddress}`);
          }

          // eslint-disable-next-line no-await-in-loop
          [rightLedger, ok] = await getConsensusChannel(rightOfMe);

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

    // if largestPaymentAmount == nil {
    //   largestPaymentAmount = big.NewInt(0)
    // }

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
  static async constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    myAddress: Address,
    getChannel: GetChannelByIdFunction,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
    latestVoucherAmount?: bigint,
  ): Promise<Objective> {
    if (!latestVoucherAmount) {
      // eslint-disable-next-line no-param-reassign
      latestVoucherAmount = BigInt(0);
    }

    let cId: Destination;
    let err: Error | undefined;

    switch (p.type) {
      case RequestFinalStatePayload: {
        try {
          cId = getRequestFinalStatePayload(p.payloadData);
        } catch (getErr) {
          err = getErr as Error;
        }
        break;
      }

      case SignedStatePayload: {
        let ss: SignedState;
        try {
          ss = getSignedStatePayload(p.payloadData);
        } catch (getErr) {
          err = getErr as Error;
        }
        cId = ss!.channelId();
        break;
      }

      default:
        throw new Error(`unknown payload type ${p.type}`);
    }

    if (err) {
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

  // finalState returns the final state for the virtual channel
  private finalState(): State {
    return this.v!.signedStateForTurnNum.get(FinalTurnNum)!.state();
  }

  private initialOutcome(): SingleAssetExit {
    return this.v!.postFundState().outcome.value![0];
  }

  private generateFinalOutcome(): SingleAssetExit {
    if (Number(this.myRole) !== 0) {
      throw new Error('Only Alice should call generateFinalOutcome');
    }

    // Since Alice is responsible for issuing vouchers she always has the largest payment amount
    // This means she can just set her FinalOutcomeFromAlice based on the largest voucher amount she has sent
    const finalOutcome = this.initialOutcome().clone();
    finalOutcome.allocations.value![0].amount = BigInt(finalOutcome.allocations.value![0].amount!) - BigInt(this.minimumPaymentAmount!);
    finalOutcome.allocations.value![1].amount = BigInt(finalOutcome.allocations.value![1].amount!) + BigInt(this.minimumPaymentAmount!);
    return finalOutcome;
  }

  // finalState returns the final state for the virtual channel
  private generateFinalState(): State {
    const exit = this.generateFinalOutcome();
    const vp = new VariablePart({ outcome: new Exit([exit]), turnNum: FinalTurnNum, isFinal: true });
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
    for (const [i, peer] of (this.v!.participants ?? []).entries()) {
      if (i !== Number(this.myRole)) {
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

    if (this.toMyLeft) {
      related.push(this.toMyLeft);
    }
    if (this.toMyRight) {
      related.push(this.toMyRight);
    }

    return related;
  }

  // Clone returns a deep copy of the receiver.
  private clone(): Objective {
    const clone = new Objective({});
    clone.status = this.status;

    clone.v = this.v!.clone();

    // if o.MinimumPaymentAmount != nil {
    //   clone.MinimumPaymentAmount = big.NewInt(0).Set(o.MinimumPaymentAmount)
    // }
    clone.minimumPaymentAmount = this.minimumPaymentAmount;

    clone.myRole = this.myRole;

    // TODO: Properly clone the consensus channels
    if (this.toMyLeft) {
      clone.toMyLeft = this.toMyLeft;
    }

    if (this.toMyRight) {
      clone.toMyRight = this.toMyRight;
    }

    return clone;
  }

  // otherParticipants returns the participants in the channel that are not the current participant.
  private otherParticipants(): Address[] {
    const others: Address[] = [];
    for (let i = 0; i < (this.v!.participants ?? []).length; i += 1) {
      if (i !== Number(this.myRole)) {
        others.push(this.v!.participants![i]);
      }
    }
    return others;
  }

  private hasFinalStateFromAlice(): boolean {
    const ok = this.v!.signedStateForTurnNum.has(FinalTurnNum);
    const ss = this.v!.signedStateForTurnNum.get(FinalTurnNum);
    return ok && ss!.state().isFinal && !this.isZero(ss!.signatures()[0]);
  }

  // Crank inspects the extended state and declares a list of Effects to be executed.
  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  async crank(signer: NitroSigner): Promise<[Objective, SideEffects, WaitingFor]> {
    const updated = this.clone();
    const sideEffects = new SideEffects({});

    // Input validation
    if (updated.status !== ObjectiveStatus.Approved) {
      return [updated, sideEffects, WaitingForNothing];
    }

    // If we don't know the amount yet we send a message to alice to request it
    if (!updated.isAlice() && !updated.hasFinalStateFromAlice()) {
      const alice = this.v!.participants![0];
      const messages = Message.createObjectivePayloadMessage(updated.id(), this.vId(), RequestFinalStatePayload, alice);
      sideEffects.messagesToSend.push(...messages);
      return [updated, sideEffects, WaitingForFinalStateFromAlice];
    }

    // Signing of the final state
    if (!updated.v!.finalSignedByMe()) {
      let s: State;

      if (updated.isAlice()) {
        try {
          s = updated.generateFinalState();
        } catch (err) {
          throw new Error(`could not generate final state: ${err}`);
        }
      } else {
        s = updated.finalState();
      }

      // Sign and store:
      let ss: SignedState;
      try {
        ss = await updated.v!.signAndAddState(s, signer);
      } catch (err) {
        throw new Error(`could not sign final state: ${err}`);
      }
      let messages: Message[];
      try {
        messages = Message.createObjectivePayloadMessage(updated.id(), ss, SignedStatePayload, ...this.otherParticipants());
      } catch (err) {
        throw new Error(`could not get create payload message: ${err}`);
      }
      sideEffects.messagesToSend.push(...messages);
    }

    // Check if all participants have signed the final state
    if (!updated.v!.finalCompleted()) {
      return [updated, sideEffects, WaitingForSupportedFinalState];
    }

    if (!updated.isAlice() && !updated.leftHasDefunded()) {
      let ledggerSideEffects: SideEffects;
      try {
        ledggerSideEffects = await updated.updateLedgerToRemoveGuarantee(updated.toMyLeft!, signer);
      } catch (err) {
        throw new Error(`error updating ledger funding: ${err}`);
      }
      sideEffects.merge(ledggerSideEffects);
    }

    if (!updated.isBob() && !updated.rightHasDefunded()) {
      let ledgerSideEffects: SideEffects;
      try {
        ledgerSideEffects = await updated.updateLedgerToRemoveGuarantee(updated.toMyRight!, signer);
      } catch (err) {
        throw new Error(`error updating ledger funding: ${err}`);
      }
      sideEffects.merge(ledgerSideEffects);
    }

    if (!updated.leftHasDefunded()) {
      return [updated, sideEffects, WaitingForDefundingOnMyLeft];
    }

    if (!updated.rightHasDefunded()) {
      return [updated, sideEffects, WaitingForDefundingOnMyRight];
    }

    // Mark the objective as done
    updated.status = ObjectiveStatus.Completed;
    return [updated, sideEffects, WaitingForNothing];
  }

  // isAlice returns true if the receiver represents participant 0 in the virtualdefund protocol.
  private isAlice(): boolean {
    return Number(this.myRole) === 0;
  }

  // isBob returns true if the receiver represents participant n+1 in the virtualdefund protocol.
  private isBob(): boolean {
    return Number(this.myRole) === (this.v!.participants ?? []).length - 1;
  }

  // ledgerProposal generates a ledger proposal to remove the guarantee for V for ledger
  private ledgerProposal(ledger: ConsensusChannel): Proposal {
    const left = this.finalState().outcome.value![0].allocations.value![0].amount;
    return Proposal.newRemoveProposal(ledger.id, this.vId(), left);
  }

  // updateLedgerToRemoveGuarantee updates the ledger channel to remove the guarantee that funds V.
  private async updateLedgerToRemoveGuarantee(ledger: ConsensusChannel, signer: NitroSigner): Promise<SideEffects> {
    const sideEffects: SideEffects = new SideEffects({});

    const proposed = ledger.hasRemovalBeenProposed(this.vId());

    if (ledger.isLeader()) {
      if (proposed) { // If we've already proposed a remove proposal we can return
        return new SideEffects({});
      }

      try {
        await ledger.propose(this.ledgerProposal(ledger), signer);
      } catch (err) {
        throw new Error(`error proposing ledger update: ${err}`);
      }

      const receipient = ledger.follower();
      // Since the proposal queue is constructed with consecutive turn numbers, we can pass it straight in
      // to create a valid message with ordered proposals:

      const message = Message.createSignedProposalMessage(receipient, ...(ledger.proposalQueue() ?? []));
      sideEffects.messagesToSend.push(message);
    } else {
      // If the proposal is next in the queue we accept it
      const proposedNext = ledger.hasRemovalBeenProposedNext(this.vId());

      if (proposedNext) {
        let sp: SignedProposal;
        try {
          sp = await ledger.signNextProposal(this.ledgerProposal(ledger), signer);
        } catch (err) {
          throw new Error(`could not sign proposal: ${err}`);
        }

        // ledger sideEffect
        const proposals = ledger.proposalQueue();
        if (proposals !== null && proposals.length !== 0) {
          sideEffects.proposalsToProcess.push(proposals[0].proposal);
        }

        // messaging sideEffect
        const receipient = ledger.leader();
        const message = Message.createSignedProposalMessage(receipient, sp);
        sideEffects.messagesToSend.push(message);
      }
    }

    return sideEffects;
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
    if (!this.toMyRight) {
      return true;
    }

    const included = this.toMyRight.includesTarget(this.vId());
    return !included;
  }

  // leftHasDefunded returns whether the ledger channel ToMyLeft has removed
  // its funding for the target channel.
  //
  // If ToMyLeft==nil then we return true.
  private leftHasDefunded(): boolean {
    if (!this.toMyLeft) {
      return true;
    }

    const included = this.toMyLeft.includesTarget(this.vId());
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
            ss.state().outcome.value![0],
            this.v!.participants![Number(this.myRole)],
            updated.minimumPaymentAmount,
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
  receiveProposal(sp: SignedProposal): ProposalReceiver {
    let toMyLeftId: Destination | undefined;
    let toMyRightId: Destination | undefined;

    if (this.toMyLeft) {
      toMyLeftId = this.toMyLeft.id;
    }
    if (this.toMyRight) {
      toMyRightId = this.toMyRight.id;
    }

    const updated = this.clone();

    if (_.isEqual(sp.proposal.target(), this.vId())) {
      let err: Error | undefined;

      switch (true) {
        case _.isEqual(sp.proposal.ledgerID, new Destination()): {
          throw new Error('signed proposal is for a zero-addressed ledger channel');
        // catch this case to avoid unspecified behaviour -- because if Alice or Bob we allow a null channel.
        }

        case _.isEqual(sp.proposal.ledgerID, toMyLeftId): {
          try {
            updated.toMyLeft!.receive(sp);
          } catch (receiveErr) {
            err = receiveErr as Error;
          }
          break;
        }

        case _.isEqual(sp.proposal.ledgerID, toMyRightId): {
          try {
            updated.toMyRight!.receive(sp);
          } catch (receiveErr) {
            err = receiveErr as Error;
          }
          break;
        }

        default:
          throw new Error('signed proposal is not addressed to a known ledger connection');
      }

      // Ignore stale or future proposals.
      if (err && (err as Error).message.includes(ErrInvalidTurnNum.message)) {
        return updated;
      }

      if (err) {
        throw new Error(`error incorporating signed proposal ${JSONbigNative.stringify(sp)} into objective: ${err}`);
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
