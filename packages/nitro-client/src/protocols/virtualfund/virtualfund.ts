import assert from 'assert';
import { ethers } from 'ethers';
import _ from 'lodash';
import { Buffer } from 'buffer';

import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';
import {
  FieldDescription, JSONbigNative, Uint64, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { Destination } from '../../types/destination';
import {
  ConsensusChannel, SignedProposal, Proposal, Guarantee, ErrIncorrectChannelID, ErrInvalidTurnNum,
} from '../../channel/consensus-channel/consensus-channel';
import { Exit } from '../../channel/state/outcome/exit';
import { FixedPart, State } from '../../channel/state/state';
import { Funds } from '../../types/funds';
import { Address } from '../../types/types';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  ObjectiveStatus,
  SideEffects,
  WaitingFor,
  Storable,
  ProposalReceiver,
  errNotApproved,
} from '../interfaces';
import {
  Message, ObjectiveId, ObjectivePayload, getProposalObjectiveId, PayloadType,
} from '../messages';
import { VirtualChannel } from '../../channel/virtual';
import { GuaranteeMetadata } from '../../channel/state/outcome/guarantee';
import { SignedState } from '../../channel/state/signedstate';

export const ObjectivePrefix = 'VirtualFund-';
const WaitingForCompletePrefund: WaitingFor = 'WaitingForCompletePrefund'; // Round 1
const WaitingForCompleteFunding: WaitingFor = 'WaitingForCompleteFunding'; // Round 2
const WaitingForCompletePostFund: WaitingFor = 'WaitingForCompletePostFund'; // Round 3
const WaitingForNothing: WaitingFor = 'WaitingForNothing'; // Finished

const SignedStatePayload: PayloadType = 'SignedStatePayload';

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): [ConsensusChannel | undefined, boolean]
}

class GuaranteeInfo {
  public left: Destination = new Destination();

  public right: Destination = new Destination();

  // TODO: Make non-optional?
  public leftAmount?: Funds;

  public rightAmount?: Funds;

  public guaranteeDestination: Destination = new Destination();

  static jsonEncodingMap: Record<string, FieldDescription> = {
    left: { type: 'class', value: Destination },
    right: { type: 'class', value: Destination },
    leftAmount: { type: 'class', value: Funds },
    rightAmount: { type: 'class', value: Funds },
    guaranteeDestination: { type: 'class', value: Destination },
  };

  static fromJSON(data: string): GuaranteeInfo {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new GuaranteeInfo(props);
  }

  toJSON(): any {
    return toJSON(GuaranteeInfo.jsonEncodingMap, this);
  }

  constructor(params: {
    left?: Destination,
    right?: Destination,
    leftAmount?: Funds,
    rightAmount?: Funds,
    guaranteeDestination?: Destination
  }) {
    Object.assign(this, params);
  }
}

export class Connection {
  channel?: ConsensusChannel;

  guaranteeInfo: GuaranteeInfo = new GuaranteeInfo({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    channel: { type: 'class', value: ConsensusChannel },
    guaranteeInfo: { type: 'class', value: GuaranteeInfo },
  };

  static fromJSON(data: string): Connection {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new Connection(props);
  }

  toJSON(): any {
    return toJSON(Connection.jsonEncodingMap, this);
  }

  constructor(params: {
    channel?: ConsensusChannel,
    guaranteeInfo?: GuaranteeInfo,
  }) {
    Object.assign(this, params);
  }

  // insertGuaranteeInfo mutates the receiver Connection struct.
  insertGuaranteeInfo(a0: Funds, b0: Funds, vId: Destination, left: Destination, right: Destination) {
    const guaranteeInfo = new GuaranteeInfo({
      left,
      right,
      leftAmount: a0,
      rightAmount: b0,
      guaranteeDestination: vId,
    });

    const metadata = new GuaranteeMetadata({
      left: guaranteeInfo.left,
      right: guaranteeInfo.right,
    });

    metadata.encode();

    // The metadata can be encoded, so update the connection's guarantee
    this.guaranteeInfo = guaranteeInfo;
  }

  // handleProposal receives a signed proposal and acts according to the leader / follower
  handleProposal(sp: SignedProposal): void {
    // TODO: Create error in caller
    // if c == nil {
    //   return fmt.Errorf("nil connection should not handle proposals")
    // }

    if (!_.isEqual(sp.proposal.ledgerID, this.channel!.id)) {
      throw ErrIncorrectChannelID;
    }

    if (this.channel) {
      try {
        this.channel.receive(sp);
      } catch (err) {
        // Ignore stale or future proposals
        if ((err as Error).message.includes(ErrInvalidTurnNum.message)) {
          /* eslint-disable no-useless-return */
          return;
        }
      }
    }
  }

  // IsFundingTheTarget computes whether the ledger channel on the receiver funds the guarantee expected by this connection
  isFundingTheTarget(): boolean {
    const g = this.getExpectedGuarantee();
    return this.channel!.includes(g);
  }

  // getExpectedGuarantee returns a map of asset addresses to guarantees for a Connection.
  getExpectedGuarantee(): Guarantee {
    const amountFunds = this.guaranteeInfo.leftAmount!.add(this.guaranteeInfo.rightAmount!);

    // HACK: GuaranteeInfo stores amounts as types.Funds.
    // We only expect a single asset type, and we want to know how much is to be
    // diverted for that asset type.
    // So, we loop through amountFunds and break after the first asset type ...
    let amount: bigint = BigInt(0);

    /* eslint-disable no-unreachable-loop */
    for (const [, val] of amountFunds.value) {
      amount = val;
      break;
    }

    const target = this.guaranteeInfo.guaranteeDestination;
    const { left } = this.guaranteeInfo;
    const { right } = this.guaranteeInfo;

    return Guarantee.newGuarantee(amount, target, left, right);
  }

  expectedProposal(): Proposal {
    const g = this.getExpectedGuarantee();

    let leftAmount: bigint = BigInt(0);

    /* eslint-disable no-unreachable-loop */
    for (const [, val] of this.guaranteeInfo.leftAmount!.value) {
      leftAmount = val;
      break;
    }

    const proposal = Proposal.newAddProposal(this.channel!.id, g, leftAmount);
    return proposal;
  }
}

// Objective is a cache of data computed by reading from the store. It stores (potentially) infinite data.
export class Objective implements ObjectiveInterface, ProposalReceiver {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  v?: VirtualChannel;

  toMyLeft?: Connection;

  toMyRight?: Connection;

  private n: number = 0; // number of intermediaries

  myRole: number = 0; // index in the virtual funding protocol. 0 for Alice, n+1 for Bob. Otherwise, one of the intermediaries.

  private a0?: Funds; // Initial balance for Alice

  private b0?: Funds; // Initial balance for Bob

  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    v: { type: 'class', value: VirtualChannel },
    toMyLeft: { type: 'class', value: Connection },
    toMyRight: { type: 'class', value: Connection },
    n: { type: 'number' },
    myRole: { type: 'number' },
    a0: { type: 'class', value: Funds },
    b0: { type: 'class', value: Funds },
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
    v?: VirtualChannel,
    toMyLeft?: Connection,
    toMyRight?: Connection,
    n?: number,
    myRole?: number,
    a0?: Funds,
    b0?: Funds,
  }) {
    Object.assign(this, params);
  }

  // NewObjective creates a new virtual funding objective from a given request.
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    chainId: bigint,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    let toMyRight: string;
    if (request.intermediaries.length > 0) {
      [toMyRight] = request.intermediaries;
    } else {
      toMyRight = request.counterParty;
    }

    const [rightCC, ok] = getTwoPartyConsensusLedger(toMyRight);
    if (!ok) {
      throw new Error(`Could not find ledger for ${myAddress} and ${toMyRight}`);
    }

    let leftCC: ConsensusChannel | undefined;

    const participants: Address[] = [myAddress, ...request.intermediaries, request.counterParty];

    const state = new State({
      participants,
      channelNonce: request.nonce,
      challengeDuration: request.challengeDuration,
      outcome: request.outcome,
      turnNum: BigInt(0),
      isFinal: false,
    });

    try {
      const objective = this.constructFromState(
        preApprove,
        state,
        myAddress,
        leftCC,
        rightCC,
      );

      return objective;
    } catch (err) {
      throw new Error(`Error creating objective: ${err}`);
    }
  }

  // constructFromState initiates an Objective from an initial state and set of ledgers.
  static constructFromState(
    preApprove: boolean,
    initialStateOfV: State,
    myAddress: Address,
    consensusChannelToMyLeft?: ConsensusChannel,
    consensusChannelToMyRight?: ConsensusChannel,
  ): Objective {
    const init: Objective = new Objective({});

    if (preApprove) {
      init.status = ObjectiveStatus.Approved;
    } else {
      init.status = ObjectiveStatus.Unapproved;
    }

    // Infer MyRole
    let found = false;
    for (let i = 0; i < initialStateOfV.participants.length; i += 1) {
      const addr = initialStateOfV.participants[i];
      if (addr === myAddress) {
        init.myRole = i;
        found = true;
      }
    }
    if (!found) {
      throw new Error('Not a participant in V');
    }

    const v: VirtualChannel = VirtualChannel.newVirtualChannel(initialStateOfV, init.myRole);
    init.v = v;

    // NewSingleHopVirtualChannel will error unless there are at least 3 participants
    init.n = initialStateOfV.participants.length - 2;

    init.a0 = new Funds(new Map<Address, bigint>());
    init.b0 = new Funds(new Map<Address, bigint>());

    for (const outcome of initialStateOfV.outcome.value) {
      const { asset } = outcome;

      if (!_.isEqual(outcome.allocations.value[0].destination, Destination.addressToDestination(initialStateOfV.participants[0]))) {
        throw new Error('Allocation in slot 0 does not correspond to participant 0');
      }
      const amount0 = outcome.allocations.value[0].amount;

      if (!_.isEqual(outcome.allocations.value[1].destination, Destination.addressToDestination(initialStateOfV.participants[init.n + 1]))) {
        throw new Error(`Allocation in slot 1 does not correspond to participant ${init.n + 1}`);
      }
      const amount1 = outcome.allocations.value[1].amount;

      if (!init.a0.value.has(asset)) {
        init.a0.value.set(asset, BigInt(0));
      }
      if (!init.b0.value.has(asset)) {
        init.b0.value.set(asset, BigInt(0));
      }
      init.a0.value.set(asset, init.a0.value.get(asset)! + amount0);
      init.b0.value.set(asset, init.b0.value.get(asset)! + amount1);
    }

    // Setup Ledger Channel Connections and expected guarantees

    // everyone other than Alice has a left-channel
    if (!init.isAlice()) {
      init.toMyLeft = new Connection({});

      if (!consensusChannelToMyLeft) {
        throw new Error('Non-Alice virtualfund objective requires non-null left ledger channel');
      }

      init.toMyLeft.channel = consensusChannelToMyLeft;
      init.toMyLeft.insertGuaranteeInfo(
        init.a0,
        init.b0,
        v.id,
        Destination.addressToDestination(init.v.participants[init.myRole - 1]),
        Destination.addressToDestination(init.v.participants[init.myRole]),
      );
    }

    if (!init.isBob()) {
      init.toMyRight = new Connection({});

      if (!consensusChannelToMyRight) {
        throw new Error('Non-Bob virtualfund objective requires non-null right ledger channel');
      }

      init.toMyRight.channel = consensusChannelToMyRight;
      init.toMyRight.insertGuaranteeInfo(
        init.a0,
        init.b0,
        init.v.id,
        Destination.addressToDestination(init.v.participants[init.myRole]),
        Destination.addressToDestination(init.v.participants[init.myRole + 1]),
      );
    }

    return init;
  }

  // getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
  static getSignedStatePayload(b: Buffer): SignedState {
    let ss: SignedState;
    try {
      ss = SignedState.fromJSON(b.toString());
    } catch (err) {
      throw new Error(`could not unmarshal signed state: ${err}`);
    }
    return ss;
  }

  // ConstructObjectiveFromPayload takes in a message and constructs an objective from it.
  // It accepts the message, myAddress, and a function to to retrieve ledgers from a store.
  static constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    myAddress: Address,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    let initialState: SignedState;
    try {
      initialState = this.getSignedStatePayload(p.payloadData);
    } catch (err) {
      throw new Error(`could not get signed state payload: ${err}`);
    }
    const { participants } = initialState.state();

    let leftC: ConsensusChannel | undefined;
    let rightC: ConsensusChannel | undefined;
    let ok: boolean;

    if (myAddress === participants[0]) {
      // I am Alice
      throw new Error('participant[0] should not construct objectives from peer messages');
    } else if (myAddress === participants[participants.length - 1]) {
      // I am Bob
      const leftOfBob = participants[participants.length - 2];
      ([leftC, ok] = getTwoPartyConsensusLedger(leftOfBob));
      if (!ok) {
        throw new Error(`could not find a left ledger channel between ${leftOfBob} and ${myAddress}`);
      }
    } else {
      const intermediaries = participants.slice(1, participants.length - 1);
      let foundMyself = false;

      for (const [i, intermediary] of intermediaries.entries()) {
        if (myAddress === intermediary) {
          foundMyself = true;
          // I am intermediary `i` and participant `p`
          // Error: Changed variable from p to e
          // error  'p' is already declared in the upper scope (function argument)
          const e = i + 1; // participants[p] === intermediaries[i]

          const leftOfMe = participants[e - 1];
          const rightOfMe = participants[e + 1];

          ([leftC, ok] = getTwoPartyConsensusLedger(leftOfMe));
          if (!ok) {
            throw new Error(`could not find a left ledger channel between ${leftOfMe} and ${myAddress}`);
          }

          ([rightC, ok] = getTwoPartyConsensusLedger(rightOfMe));
          if (!ok) {
            throw new Error(`could not find a right ledger channel between ${myAddress} and ${rightOfMe}`);
          }

          break;
        }
      }

      if (!foundMyself) {
        throw new Error('client address not found in the participant list');
      }
    }

    return this.constructFromState(preapprove, initialState.state(), myAddress, leftC, rightC);
  }

  id(): ObjectiveId {
    return `${ObjectivePrefix}${this.v!.id.string()}`;
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

    const message = Message.createRejectionNoticeMessage(this.id(), ...this.otherParticipants());
    const sideEffects = new SideEffects({ messagesToSend: message });
    return [updated, sideEffects];
  }

  // OwnsChannel returns the channel the objective exclusively owns.
  ownsChannel(): Destination {
    return this.v!.id;
  }

  // GetStatus returns the status of the objective.
  getStatus(): ObjectiveStatus {
    return this.status;
  }

  private otherParticipants(): Address[] {
    const otherParticipants: Address[] = [];

    for (let i = 0; i < this.v!.participants.length; i += 1) {
      if (i !== this.myRole) {
        otherParticipants.push(this.v!.participants[i]);
      }
    }

    return otherParticipants;
  }

  private getPayload(raw: ObjectivePayload): SignedState {
    return SignedState.fromJSON(raw.payloadData.toString());
  }

  receiveProposal(sp: SignedProposal): ProposalReceiver {
    const pId = getProposalObjectiveId(sp.proposal);
    if (this.id() !== pId) {
      throw new Error(`sp and objective Ids do not match: ${pId} and ${this.id()} respectively`);
    }

    const updated = this.clone();

    let toMyLeftId: Destination;
    let toMyRightId: Destination;

    if (!this.isAlice()) {
      toMyLeftId = this.toMyLeft!.channel!.id; // Avoid this if it is nil
    }
    if (!this.isBob()) {
      toMyRightId = this.toMyRight!.channel!.id; // Avoid this if it is nil
    }

    if (_.isEqual(sp.proposal.target(), this.v!.id)) {
      let err: Error | undefined;
      switch (true) {
        case _.isEqual(sp.proposal.ledgerID, new Destination()):
          throw new Error('signed proposal is for a zero-addressed ledger channel');
          // catch this case to avoid unspecified behaviour -- because if Alice or Bob we allow a null channel.
        case _.isEqual(sp.proposal.ledgerID, toMyLeftId!):
          try {
            updated.toMyLeft!.handleProposal(sp);
          } catch (handleErr) {
            err = handleErr as Error;
          }
          break;
        case _.isEqual(sp.proposal.ledgerID, toMyRightId!):
          try {
            updated.toMyRight!.handleProposal(sp);
          } catch (handleErr) {
            err = handleErr as Error;
          }
          break;
        default:
          throw new Error('signed proposal is not addressed to a known ledger connection');
      }

      if (err) {
        throw new Error(`error incorporating signed proposal ${sp} into objective: ${err}`);
      }
    }

    return updated;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  update(raw: ObjectivePayload): Objective {
    if (this.id() !== raw.objectiveId) {
      throw new Error(`raw and objective Ids do not match: ${raw.objectiveId} and ${this.id()} respectively`);
    }

    let payload: SignedState;
    try {
      payload = this.getPayload(raw);
    } catch (err) {
      throw new Error(`error parsing payload: ${err}`);
    }

    const updated = this.clone();
    const ss = payload;
    if (ss.signatures().length !== 0) {
      updated.v!.addSignedState(ss);
    }

    return updated;
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    const updated = this.clone();

    const sideEffects = new SideEffects({});
    // Input validation
    if (updated.status !== ObjectiveStatus.Approved) {
      throw errNotApproved;
    }

    // Prefunding

    if (!updated.v!.preFundSignedByMe()) {
      const ss = updated.v!.signAndAddPrefund(secretKey);
      const messages = Message.createObjectivePayloadMessage(this.id(), ss, SignedStatePayload, ...this.otherParticipants());
      sideEffects.messagesToSend.push(...messages);
    }

    if (!updated.v!.preFundComplete()) {
      return [updated, sideEffects, WaitingForCompletePrefund];
    }

    // Funding

    if (!updated.isAlice() && !updated.toMyLeft!.isFundingTheTarget()) {
      let ledgerSideEffects: SideEffects;
      try {
        ledgerSideEffects = updated.updateLedgerWithGuarantee(updated.toMyLeft!, secretKey);
      } catch (err) {
        throw new Error(`error updating ledger funding: ${err}`);
      }
      sideEffects.merge(ledgerSideEffects);
    }

    if (!updated.isBob() && !updated.toMyRight!.isFundingTheTarget()) {
      let ledgerSideEffects: SideEffects;
      try {
        ledgerSideEffects = updated.updateLedgerWithGuarantee(updated.toMyRight!, secretKey);
      } catch (err) {
        throw new Error(`error updating ledger funding: ${err}`);
      }
      sideEffects.merge(ledgerSideEffects);
    }

    if (!updated.fundingComplete()) {
      return [updated, sideEffects, WaitingForCompleteFunding];
    }

    // Postfunding
    if (!updated.v!.postFundSignedByMe()) {
      const ss = updated.v!.signAndAddPostfund(secretKey);
      const messages = Message.createObjectivePayloadMessage(this.id(), ss, SignedStatePayload, ...this.otherParticipants());
      sideEffects.messagesToSend.push(...messages);
    }

    // Alice and Bob require a complete post fund round to know that vouchers may be enforced on chain.
    // Intermediaries do not require the complete post fund, so we allow them to finish the protocol early.
    // If they need to recover funds, they can force V to close by challenging with the pre fund state.
    // Alice and Bob may counter-challenge with a postfund state plus a redemption state.
    // See ADR-0009.

    if (!updated.v!.postFundComplete() && (updated.isAlice() || updated.isBob())) {
      return [updated, sideEffects, WaitingForCompletePostFund];
    }

    // Completion
    updated.status = ObjectiveStatus.Completed;
    return [updated, sideEffects, WaitingForNothing];
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  related(): Storable[] {
    const ret: Storable[] = [this.v!];

    if (this.toMyLeft) {
      ret.push(this.toMyLeft.channel!);
    }
    if (this.toMyRight) {
      ret.push(this.toMyRight.channel!);
    }

    return ret;
  }

  /// ///////////////////////////////////////////////
  //  Private methods on the VirtualFundObjective //
  /// ///////////////////////////////////////////////

  // fundingComplete returns true if the appropriate ledger channel guarantees sufficient funds for J
  private fundingComplete(): boolean {
    // Each peer commits to an update in L_{i-1} and L_i including the guarantees G_{i-1} and
    // {G_i} respectively, and deducting b_0 from L_{I-1} and a_0 from L_i.
    // A = P_0 and B=P_n are special cases. A only does the guarantee for L_0 (deducting a0), and B only foes the guarantee for L_n (deducting b0).
    switch (true) {
      case this.isAlice():
        return this.toMyRight!.isFundingTheTarget();
      case this.isBob():
        return this.toMyLeft!.isFundingTheTarget();
      default: // Intermediary
        return this.toMyRight!.isFundingTheTarget() && this.toMyLeft!.isFundingTheTarget();
    }
  }

  // Clone returns a deep copy of the receiver.
  private clone(): Objective {
    const clone = new Objective({});
    clone.status = this.status;
    const vClone = this.v!.clone();
    clone.v = vClone;

    if (this.toMyLeft) {
      const lClone = this.toMyLeft.channel!.clone();
      clone.toMyLeft = new Connection({ channel: lClone, guaranteeInfo: this.toMyLeft!.guaranteeInfo });
    }

    if (this.toMyRight) {
      const rClone = this.toMyRight.channel!.clone();
      clone.toMyRight = new Connection({ channel: rClone, guaranteeInfo: this.toMyRight!.guaranteeInfo });
    }

    clone.n = this.n;
    clone.myRole = this.myRole;

    clone.a0 = this.a0?.clone();
    clone.b0 = this.b0?.clone();
    return clone;
  }

  // isAlice returns true if the receiver represents participant 0 in the virtualfund protocol.
  private isAlice(): boolean {
    return this.myRole === 0;
  }

  // isBob returns true if the receiver represents participant n+1 in the virtualfund protocol.
  private isBob(): boolean {
    return this.myRole === this.n + 1;
  }

  // proposeLedgerUpdate will propose a ledger update to the channel by crafting a new state
  private proposeLedgerUpdate(connection: Connection, sk: Buffer): SideEffects {
    const ledger = connection.channel!;

    if (!ledger.isLeader()) {
      throw new Error('only the leader can propose a ledger update');
    }

    const sideEffects = new SideEffects({});

    ledger.propose(connection.expectedProposal(), sk);

    const receipient = ledger.follower();

    // Since the proposal queue is constructed with consecutive turn numbers, we can pass it straight in
    // to create a valid message with ordered proposals:
    const message = Message.createSignedProposalMessage(receipient, ...connection.channel!.proposalQueue());

    sideEffects.messagesToSend.push(message);

    return sideEffects;
  }

  // acceptLedgerUpdate checks for a ledger state proposal and accepts that proposal if it satisfies the expected guarantee.
  private acceptLedgerUpdate(c: Connection, sk: Buffer): SideEffects {
    const ledger = c.channel!;
    let sp: SignedProposal;
    try {
      sp = ledger.signNextProposal(c.expectedProposal(), sk);
    } catch (err) {
      throw new Error(`no proposed state found for ledger channel ${err}`);
    }
    const sideEffects = new SideEffects({});

    // ledger sideEffect
    const proposals = ledger.proposalQueue();
    if (proposals.length !== 0) {
      sideEffects.proposalsToProcess.push(proposals[0].proposal);
    }

    // message sideEffect
    const receipient = ledger.leader();
    const message = Message.createSignedProposalMessage(receipient, sp);
    sideEffects.messagesToSend.push(message);
    return sideEffects;
  }

  // updateLedgerWithGuarantee updates the ledger channel funding to include the guarantee.
  private updateLedgerWithGuarantee(ledgerConnection: Connection, sk: Buffer): SideEffects {
    const ledger = ledgerConnection.channel!;

    let sideEffects: SideEffects = new SideEffects({});
    const g = ledgerConnection.getExpectedGuarantee();
    const proposed = ledger.isProposed(g);

    if (ledger.isLeader()) { // If the user is the proposer craft a new proposal
      if (proposed) {
        return new SideEffects({});
      }
      let se: SideEffects;
      try {
        se = this.proposeLedgerUpdate(ledgerConnection, sk);
      } catch (err) {
        throw new Error(`error proposing ledger update: ${err}`);
      }
      sideEffects = se;
    } else {
      // If the proposal is next in the queue we accept it
      const proposedNext = ledger.isProposedNext(g);
      if (proposedNext) {
        let se: SideEffects;
        try {
          se = this.acceptLedgerUpdate(ledgerConnection, sk);
        } catch (err) {
          throw new Error(`error proposing ledger update: ${err}`);
        }

        sideEffects = se;
      }
    }
    return sideEffects;
  }
}

// IsVirtualFundObjective inspects a objective id and returns true if the objective id is for a virtual fund objective.
export function isVirtualFundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
}

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
export type ObjectiveResponse = {
  id: ObjectiveId
  channelId: Destination
};

// ObjectiveRequest represents a request to create a new virtual funding objective.
export class ObjectiveRequest implements ObjectiveRequestInterface {
  intermediaries: Address[] = [];

  counterParty: Address = ethers.constants.AddressZero;

  challengeDuration: number = 0;

  outcome?: Exit;

  nonce: Uint64 = BigInt(0);

  appDefinition: Address = ethers.constants.AddressZero;

  private objectiveStarted?: ReadWriteChannel<null>;

  constructor(params: {
    intermediaries: Address[];
    counterParty: Address;
    challengeDuration: number;
    outcome?: Exit;
    nonce: Uint64;
    appDefinition: Address;
    objectiveStarted?: ReadWriteChannel<null>;
  }) {
    Object.assign(this, params);
  }

  // NewObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(
    intermediaries: Address[],
    counterparty: Address,
    challengeDuration: number,
    outcome: Exit,
    nonce: Uint64,
    appDefinition: Address,
  ): ObjectiveRequest {
    return new ObjectiveRequest({
      intermediaries,
      counterParty: counterparty,
      challengeDuration,
      outcome,
      nonce,
      appDefinition,
      objectiveStarted: Channel(),
    });
  }

  // Id returns the objective id for the request.
  id(myAddress: Address, chainId: bigint): ObjectiveId {
    const idStr = this.channelId(myAddress).string();
    return `${ObjectivePrefix}${idStr}`;
  }

  // WaitForObjectiveToStart blocks until the objective starts
  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  // SignalObjectiveStarted is used by the engine to signal the objective has been started.
  signalObjectiveStarted(): void {
    assert(this.objectiveStarted);
    this.objectiveStarted.close();
  }

  // Response computes and returns the appropriate response from the request.
  response(myAddress: Address): ObjectiveResponse {
    const channelId = this.channelId(myAddress);

    return {
      id: `${ObjectivePrefix}${channelId.string()}`,
      channelId,
    };
  }

  channelId(myAddress: Address): Destination {
    const participants: Address[] = [myAddress];
    participants.push(...this.intermediaries);
    participants.push(this.counterParty);

    const fixedPart = new FixedPart({
      participants,
      channelNonce: this.nonce,
      challengeDuration: this.challengeDuration,
    });

    return fixedPart.channelId();
  }
}
