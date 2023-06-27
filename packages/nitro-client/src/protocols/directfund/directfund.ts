import assert from 'assert';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';

import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import {
  FieldDescription, JSONbigNative, Uint64, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { Exit } from '../../channel/state/outcome/exit';
import { Address } from '../../types/types';
import { Funds } from '../../types/funds';
import {
  Message, ObjectiveId, ObjectivePayload, PayloadType,
} from '../messages';
import { FixedPart, Signature, State } from '../../channel/state/state';
import {
  ObjectiveStatus, ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  SideEffects,
  WaitingFor,
  Storable,
  errNotApproved,
  DepositTransaction,
} from '../interfaces';
import * as channel from '../../channel/channel';
import {
  ConsensusChannel, Follower, Leader, LedgerOutcome,
} from '../../channel/consensus-channel/consensus-channel';
import { SignedState } from '../../channel/state/signedstate';
import { Destination } from '../../types/destination';
import { ChainEvent, DepositedEvent } from '../../client/engine/chainservice/chainservice';

const WaitingForCompletePrefund: WaitingFor = 'WaitingForCompletePrefund';
const WaitingForMyTurnToFund: WaitingFor = 'WaitingForMyTurnToFund';
const WaitingForCompleteFunding: WaitingFor = 'WaitingForCompleteFunding';
const WaitingForCompletePostFund: WaitingFor = 'WaitingForCompletePostFund';
const WaitingForNothing: WaitingFor = 'WaitingForNothing'; // Finished

const SignedStatePayload: PayloadType = 'SignedStatePayload';

const ObjectivePrefix = 'DirectFunding-';

export function fundOnChainEffect(cId: Destination, asset: string, amount: Funds): string {
  return `deposit ${amount.string()} into ${cId.string()}`;
}

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
interface GetChannelsByParticipantFunction {
  (participant: Address): channel.Channel[];
}

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): [ConsensusChannel | undefined, boolean];
}

// getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
const getSignedStatePayload = (b: Buffer): SignedState => {
  try {
    return SignedState.fromJSON(b.toString());
  } catch (err) {
    throw new Error(`could not unmarshal signed state: ${err}`);
  }
};

// channelsExistWithCounterparty returns true if a channel or consensus_channel exists with the counterparty
const channelsExistWithCounterparty = (
  counterparty: Address,
  getChannels: GetChannelsByParticipantFunction,
  getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
): boolean => {
  const channels = getChannels(counterparty);

  for (const c of channels) {
    if (c.participants.length === 2) {
      return true;
    }
  }

  const [, ok] = getTwoPartyConsensusLedger(counterparty);

  return ok;
};

export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = 0;

  c?: channel.Channel;

  private myDepositSafetyThreshold: Funds = new Funds();

  private myDepositTarget: Funds = new Funds();

  private fullyFundedThreshold: Funds = new Funds();

  private latestBlockNumber: Uint64 = BigInt(0);

  private transactionSubmitted: boolean = false;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    c: { type: 'class', value: channel.Channel },
    myDepositSafetyThreshold: { type: 'class', value: Funds },
    myDepositTarget: { type: 'class', value: Funds },
    fullyFundedThreshold: { type: 'class', value: Funds },
    latestBlockNumber: { type: 'number' },
    transactionSubmitted: { type: 'boolean' },
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
    c?: channel.Channel,
    myDepositSafetyThreshold?: Funds,
    myDepositTarget?: Funds,
    fullyFundedThreshold?: Funds,
    latestBlockNumber?: number,
    transactionSubmitted?: boolean
  }) {
    Object.assign(this, params);
  }

  public static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    chainId: bigint | undefined,
    getChannels: GetChannelsByParticipantFunction,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    const initialState = new State({
      participants: [myAddress, request.counterParty],
      channelNonce: request.nonce,
      appDefinition: request.appDefinition,
      challengeDuration: request.challengeDuration,
      appData: request.appData,
      outcome: request.outcome,
      turnNum: BigInt(0),
      isFinal: false,
    });

    const signedInitial = SignedState.newSignedState(initialState);
    let b: Buffer;
    try {
      b = Buffer.from(JSONbigNative.stringify(signedInitial), 'utf-8');
    } catch (err) {
      throw new Error(`could not create new objective: ${err}`);
    }

    const objectivePayload: ObjectivePayload = {
      objectiveId: request.id(myAddress, chainId),
      payloadData: b,
      type: SignedStatePayload,
    };

    let objective: Objective;
    try {
      objective = Objective.constructFromPayload(preApprove, objectivePayload, myAddress);
    } catch (err) {
      throw new Error(`could not create new objective: ${err}`);
    }

    if (channelsExistWithCounterparty(request.counterParty, getChannels, getTwoPartyConsensusLedger)) {
      throw new Error(`A channel already exists with counterparty ${request.counterParty}`);
    }

    return objective;
  }

  // constructFromPayload initiates a Objective with data calculated from
  // the supplied initialState and client address
  static constructFromPayload(
    preApprove: boolean,
    op: ObjectivePayload,
    myAddress: Address,
  ): Objective {
    let initialSignedState: SignedState;
    try {
      initialSignedState = getSignedStatePayload(op.payloadData);
    } catch (err) {
      throw new Error(`could not get signed state payload: ${err}`);
    }

    const initialState = initialSignedState.state();
    initialState.fixedPart().validate();

    if (initialState.turnNum !== BigInt(0)) {
      throw new Error('cannot construct direct fund objective without prefund state');
    }
    if (initialState.isFinal) {
      throw new Error('attempted to initiate new direct-funding objective with IsFinal == true');
    }

    const init = new Objective({});

    if (preApprove) {
      init.status = ObjectiveStatus.Approved;
    } else {
      init.status = ObjectiveStatus.Unapproved;
    }

    let myIndex = 0;
    let foundMyAddress = false;
    for (let i = 0; i < initialState.participants.length; i += 1) {
      if (initialState.participants[i] === myAddress) {
        myIndex = i;
        foundMyAddress = true;
        break;
      }
    }
    if (!foundMyAddress) {
      throw new Error('my address not found in participants');
    }

    init.c = new channel.Channel({});
    try {
      init.c = channel.Channel.new(initialState, myIndex);
    } catch (err) {
      throw new Error(`failed to initialize channel for direct-fund objective: ${err}`);
    }

    const myAllocatedAmount = initialState.outcome.totalAllocatedFor(Destination.addressToDestination(myAddress));

    init.fullyFundedThreshold = initialState.outcome.totalAllocated();
    init.myDepositSafetyThreshold = initialState.outcome.depositSafetyThreshold(Destination.addressToDestination(myAddress));
    init.myDepositTarget = init.myDepositSafetyThreshold.add(myAllocatedAmount);

    return init;
  }

  // OwnsChannel returns the channel the objective exclusively owns.
  ownsChannel(): Destination {
    assert(this.c);
    return this.c.id;
  }

  // GetStatus returns the status of the objective.
  getStatus(): ObjectiveStatus {
    return this.status;
  }

  createConsensusChannel(): ConsensusChannel {
    assert(this.c);
    const ledger = this.c;

    if (!ledger.postFundComplete()) {
      throw new Error(`Expected funding for channel ${this.c.id} to be complete`);
    }

    const signedPostFund = ledger.signedPostFundState();
    const leaderSig = signedPostFund.getParticipantSignature(Leader);
    const followerSig = signedPostFund.getParticipantSignature(Follower);
    const signatures: [Signature, Signature] = [leaderSig, followerSig];

    if (signedPostFund.state().outcome.value.length !== 1) {
      throw new Error('A consensus channel only supports a single asset');
    }

    const assetExit = signedPostFund.state().outcome.value[0];
    const { turnNum } = signedPostFund.state();
    const outcome = LedgerOutcome.fromExit(assetExit);

    if (ledger.myIndex === Leader) {
      const con = ConsensusChannel.newLeaderChannel(ledger, turnNum, outcome, signatures);
      con.onChainFunding = ledger.onChainFunding.clone(); // Copy OnChainFunding so we don't lose this information
      return con;
    }
    const con = ConsensusChannel.newFollowerChannel(ledger, turnNum, outcome, signatures);
    con.onChainFunding = ledger.onChainFunding.clone(); // Copy OnChainFunding so we don't lose this information
    return con;
  }

  // Public methods on the DirectFundingObjectiveState

  id(): ObjectiveId {
    return `${ObjectivePrefix}${this.c?.id.string()}`;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  approve(): ObjectiveInterface {
    const updated = this.clone();
    // todo: consider case of s.Status == Rejected
    updated.status = ObjectiveStatus.Approved;

    return updated;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  reject(): [ObjectiveInterface, SideEffects] {
    const updated = this.clone();

    assert(this.c);
    updated.status = ObjectiveStatus.Rejected;
    const peer = this.c.participants[1 - this.c.myIndex];

    const sideEffects = new SideEffects({
      messagesToSend: Message.createRejectionNoticeMessage(this.id(), peer),
    });
    return [updated, sideEffects];
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  update(p: ObjectivePayload): ObjectiveInterface {
    if (this.id() !== p.objectiveId) {
      // TODO: Handle partial return case if required
      throw new Error(`event and objective Ids do not match: ${p.objectiveId} and ${this.id()} respectively`);
    }

    const updated = this.clone();
    let ss: SignedState;
    try {
      ss = getSignedStatePayload(p.payloadData);
    } catch (err) {
      throw new Error(`could not get signed state payload: ${err}`);
    }

    assert(updated.c);
    updated.c.addSignedState(ss);
    return updated;
  }

  // UpdateWithChainEvent updates the objective with observed on-chain data.
  //
  // Only Channel Deposit events are currently handled.
  updateWithChainEvent(event: ChainEvent): ObjectiveInterface {
    const updated = this.clone();

    if (!(event instanceof DepositedEvent)) {
      // TODO: Handle partial return case if required
      throw new Error(`objective ${updated} cannot handle event ${event}`);
    }

    const de = event;

    if (BigInt(de.blockNum) > updated.latestBlockNumber) {
      updated.c!.onChainFunding.value.set(de.assetAndAmount.assetAddress, de.nowHeld!);
      updated.latestBlockNumber = BigInt(de.blockNum);
    }

    return updated;
  }

  private otherParticipants(): Address[] {
    const others: Address[] = [];

    for (let i = 0; i < this.c!.participants.length; i += 1) {
      if (i !== this.c!.myIndex) {
        others.push(this.c!.participants[i]);
      }
    }

    return others;
  }

  /**
   * Crank inspects the extended state and declares a list of Effects to be executed.
   * It's like a state machine transition function where the finite/enumerable state is returned
   * (computed from the extended state) rather than being independent of the extended state;
   * and where there is only one type of event ("the crank") with no data on it at all.
   */
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    const updated = this.clone();
    const sideEffects = new SideEffects({});

    // Input validation
    if (updated.status !== ObjectiveStatus.Approved) {
      throw errNotApproved;
    }

    // Prefunding
    assert(updated.c);
    if (!updated.c.preFundSignedByMe()) {
      let ss: SignedState;
      try {
        ss = updated.c.signAndAddPrefund(secretKey);
      } catch (err) {
        throw new Error(`could not sign prefund ${err}`);
      }

      let messages: Message[];
      try {
        messages = Message.createObjectivePayloadMessage(updated.id(), ss, 'SignedStatePayload', ...updated.otherParticipants());
      } catch (err) {
        throw new Error(`could not create payload message ${err}`);
      }

      sideEffects.messagesToSend = sideEffects.messagesToSend.concat(messages);
    }

    if (!updated.c.preFundComplete()) {
      return [updated, sideEffects, WaitingForCompletePrefund];
    }

    // Funding
    const fundingComplete = updated.fundingComplete();
    const amountToDeposit = updated.amountToDeposit();
    const safeToDeposit = updated.safeToDeposit();

    if (!fundingComplete && !safeToDeposit) {
      return [updated, sideEffects, WaitingForMyTurnToFund];
    }

    if (!fundingComplete && safeToDeposit && amountToDeposit.isNonZero() && !updated.transactionSubmitted) {
      const deposit = DepositTransaction.newDepositTransaction(updated.c.id, amountToDeposit);
      updated.transactionSubmitted = true;
      sideEffects.transactionsToSubmit.push(deposit);
    }

    if (!fundingComplete) {
      return [updated, sideEffects, WaitingForCompleteFunding];
    }

    // Postfunding
    if (!updated.c.postFundSignedByMe()) {
      let ss: SignedState;
      try {
        ss = updated.c.signAndAddPostfund(secretKey);
      } catch (err) {
        throw new Error(`could not sign postfund ${err}`);
      }

      let messages: Message[];
      try {
        messages = Message.createObjectivePayloadMessage(updated.id(), ss, SignedStatePayload, ...updated.otherParticipants());
      } catch (err) {
        throw new Error('could not create payload message');
      }

      sideEffects.messagesToSend = messages;
    }

    if (!updated.c.postFundComplete()) {
      return [updated, sideEffects, WaitingForCompletePostFund];
    }

    // Completion
    updated.status = ObjectiveStatus.Completed;
    return [updated, sideEffects, WaitingForNothing];
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  related(): Storable[] {
    assert(this.c);
    return [this.c];
  }

  //  Private methods on the DirectFundingObjectiveState

  // fundingComplete returns true if the recorded OnChainHoldings are greater than or equal to the threshold for being fully funded.
  private fundingComplete(): boolean {
    for (const [asset, threshold] of this.fullyFundedThreshold!.value) {
      const chainHolding = this.c!.onChainFunding.value.get(asset);

      if (chainHolding === undefined) {
        return false;
      }

      if (threshold > chainHolding) {
        return false;
      }
    }

    return true;
  }

  // safeToDeposit returns true if the recorded OnChainHoldings are greater than or equal to the threshold for safety.
  private safeToDeposit(): boolean {
    for (const [asset, safetyThreshold] of this.myDepositSafetyThreshold!.value) {
      const chainHolding = this.c!.onChainFunding.value.get(asset);

      if (chainHolding === undefined) {
        return false;
      }

      if (safetyThreshold > chainHolding) {
        return false;
      }
    }

    return true;
  }

  // amountToDeposit computes the appropriate amount to deposit given the current recorded OnChainHoldings
  private amountToDeposit(): Funds {
    const deposits: Funds = new Funds();

    for (const [asset, target] of this.myDepositTarget!.value) {
      const holding = this.c!.onChainFunding.value.get(asset) ?? BigInt(0);
      deposits.value.set(asset, target - holding);
    }

    return deposits;
  }

  /**
  * clone returns a deep copy of the receiver.
  */
  private clone(): Objective {
    const clone = new Objective({});
    clone.status = this.status;

    assert(this.c);
    const cClone = this.c.clone();
    clone.c = cClone;

    clone.myDepositSafetyThreshold = this.myDepositSafetyThreshold.clone();
    clone.myDepositTarget = this.myDepositTarget.clone();
    clone.fullyFundedThreshold = this.fullyFundedThreshold.clone();
    clone.latestBlockNumber = this.latestBlockNumber;
    clone.transactionSubmitted = this.transactionSubmitted;

    return clone;
  }

  // TODO: Can throw an error
  // TODO: Check interface and implement
  marshalJSON(): Buffer {
    return Buffer.alloc(0);
  }

  // TODO: Can throw an error
  // TODO: Check interface and implement
  unmarshalJSON(b: Buffer): void {}
}

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
export type ObjectiveResponse = {
  id: ObjectiveId
  channelId: Destination
};

// IsDirectFundObjective inspects a objective id and returns true if the objective id is for a direct fund objective.
export function isDirectFundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
}

// ObjectiveRequest represents a request to create a new direct funding objective.
export class ObjectiveRequest implements ObjectiveRequestInterface {
  counterParty: Address = ethers.constants.AddressZero;

  // TODO: uint32 replacement
  challengeDuration: number = 0;

  outcome: Exit = new Exit([]);

  appDefinition: Address = ethers.constants.AddressZero;

  appData: Buffer = Buffer.alloc(0);

  nonce: Uint64 = BigInt(0);

  private objectiveStarted?: ReadWriteChannel<void>;

  constructor(params: {
    counterParty: Address,
    challengeDuration: number,
    outcome: Exit,
    appDefinition: Address,
    appData?: Buffer,
    nonce: Uint64,
    objectiveStarted?: ReadWriteChannel<void>
  }) {
    Object.assign(this, params);
  }

  // newObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(
    counterparty: Address,
    challengeDuration: number,
    outcome: Exit,
    nonce: Uint64,
    appDefinition: Address,
  ): ObjectiveRequest {
    return new ObjectiveRequest({
      counterParty: counterparty,
      challengeDuration,
      outcome,
      nonce,
      appDefinition,
      objectiveStarted: Channel(),
    });
  }

  // SignalObjectiveStarted is used by the engine to signal the objective has been started.
  signalObjectiveStarted(): void {
    assert(this.objectiveStarted);
    this.objectiveStarted.close();
  }

  // WaitForObjectiveToStart blocks until the objective starts
  async waitForObjectiveToStart(): Promise<void> {
    assert(this.objectiveStarted);
    await this.objectiveStarted.shift();
  }

  // Id returns the objective id for the request.
  id(myAddress: Address, chainId?: bigint): ObjectiveId {
    const fixedPart: FixedPart = new FixedPart({
      participants: [myAddress, this.counterParty],
      channelNonce: this.nonce,
      challengeDuration: this.challengeDuration,
    });

    const channelId: Destination = fixedPart.channelId();
    return `${ObjectivePrefix}${channelId.string()}` as ObjectiveId;
  }

  // Response computes and returns the appropriate response from the request.
  response(myAddress: Address, chainId?: bigint): ObjectiveResponse {
    const fixedPart = new FixedPart({
      participants: [myAddress, this.counterParty],
      channelNonce: this.nonce,
      challengeDuration: this.challengeDuration,
      appDefinition: this.appDefinition,
    });

    const channelId = fixedPart.channelId();

    return {
      id: `${ObjectivePrefix}${channelId.string()}`,
      channelId,
    };
  }
}
