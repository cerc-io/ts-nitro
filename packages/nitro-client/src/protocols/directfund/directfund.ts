import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';
import JSONbig from 'json-bigint';

import assert from 'assert';
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

const JSONbigNative = JSONbig({ useNativeBigInt: true });

const waitingForCompletePrefund: WaitingFor = 'WaitingForCompletePrefund';
const waitingForMyTurnToFund: WaitingFor = 'WaitingForMyTurnToFund';
const waitingForCompleteFunding: WaitingFor = 'WaitingForCompleteFunding';
const waitingForCompletePostFund: WaitingFor = 'WaitingForCompletePostFund';
const waitingForNothing: WaitingFor = 'WaitingForNothing'; // Finished

const signedStatePayload: PayloadType = 'SignedStatePayload';

const objectivePrefix = 'DirectDefunding-';

// GetChannelByIdFunction specifies a function that can be used to retrieve channels from a store.
interface GetChannelsByParticipantFunction {
  (participant: Address): channel.Channel[];
}

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): [ConsensusChannel, boolean];
}

// getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
// TODO: Implement unmarshal
const getSignedStatePayload = (b: Buffer): SignedState => {
  try {
    // TODO: Implement Go json.Unmarshal
    // const ss = SignedState.fromJSON(b.toString());

    return new SignedState({});
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

  private myDepositSafetyThreshold?: Funds;

  private myDepositTarget?: Funds;

  private fullyFundedThreshold?: Funds;

  private latestBlockNumber: number = 0;

  private transactionSubmitted: boolean = false;

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
    chainId: bigint,
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
      turnNum: 0,
      isFinal: false,
    });

    const signedInitial = SignedState.newSignedState(initialState);
    const b = Buffer.from(JSONbigNative.stringify(signedInitial), 'utf-8');
    const objectivePayload: ObjectivePayload = {
      objectiveId: request.id(myAddress, chainId),
      payloadData: b,
      type: signedStatePayload,
    };

    const objective = Objective.constructFromPayload(preApprove, objectivePayload, myAddress);

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
    assert(initialState);
    const error = initialState.fixedPart().validate();
    if (error) {
      throw error;
    }
    if (initialState.turnNum !== 0) {
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
  // TODO: Implement
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
      const con = ConsensusChannel.newLeaderChannel(ledger.fixedPart!, turnNum, outcome, signatures);
      con.onChainFunding = ledger.onChainFunding.clone(); // Copy OnChainFunding so we don't lose this information
      return con;
    }
    const con = ConsensusChannel.newFollowerChannel(ledger.fixedPart!, turnNum, outcome, signatures);
    con.onChainFunding = ledger.onChainFunding.clone(); // Copy OnChainFunding so we don't lose this information
    return con;
  }

  // Public methods on the DirectFundingObjectiveState

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
  // TODO: Can throw an error
  // TODO: Implement
  update(payload: ObjectivePayload): Objective {
    return new Objective({});
  }

  otherParticipants(): Address[] {
    const others: Address[] = [];
    assert(this.c);

    for (let i = 0; i < this.c.participants.length; i += 1) {
      if (i !== this.c.myIndex) {
        others.push(this.c.participants[i]);
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
    const sideEffects: SideEffects = {
      messagesToSend: [],
      transactionsToSubmit: [],
      proposalsToProcess: [],
    };

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
      return [updated, sideEffects, waitingForCompletePrefund];
    }

    // Funding
    const fundingComplete = updated.fundingComplete();
    const amountToDeposit = updated.amountToDeposit();
    const safeToDeposit = updated.safeToDeposit();

    if (!fundingComplete && !safeToDeposit) {
      return [updated, sideEffects, waitingForMyTurnToFund];
    }

    if (!fundingComplete && safeToDeposit && amountToDeposit.isNonZero() && !updated.transactionSubmitted) {
      const deposit = DepositTransaction.newDepositTransaction(updated.c.id, amountToDeposit);
      updated.transactionSubmitted = true;
      sideEffects.transactionsToSubmit.push(deposit);
    }

    if (!fundingComplete) {
      return [updated, sideEffects, waitingForCompleteFunding];
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
        messages = Message.createObjectivePayloadMessage(updated.id(), ss, signedStatePayload, ...updated.otherParticipants());
      } catch (err) {
        throw new Error('could not create payload message');
      }

      sideEffects.messagesToSend = messages;
    }

    if (!updated.c.postFundComplete()) {
      return [updated, sideEffects, waitingForCompletePostFund];
    }

    // Completion
    updated.status = ObjectiveStatus.Completed;
    return [updated, sideEffects, waitingForNothing];
  }

  // Related returns a slice of related objects that need to be stored along with the objective
  // TODO: Implement
  related(): Storable[] {
    return [];
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

    assert(this.myDepositSafetyThreshold);
    assert(this.myDepositTarget);
    assert(this.fullyFundedThreshold);
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
  unmarshalJSON(b: Buffer): void { }
}

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
export type ObjectiveResponse = {
  id: ObjectiveId
  channelId: string
};

// ObjectiveRequest represents a request to create a new direct funding objective.
export class ObjectiveRequest implements ObjectiveRequestInterface {
  counterParty: Address = '';

  // TODO: uint32 replacement
  challengeDuration: number = 0;

  outcome: Exit = new Exit([]);

  appDefinition: Address = '';

  appData: Buffer = Buffer.alloc(0);

  nonce: string = '';

  private objectiveStarted?: ReadWriteChannel<void>;

  constructor(params: {
    counterParty: Address,
    challengeDuration: number,
    outcome: Exit,
    appDefinition: Address,
    appData?: Buffer,
    nonce: string,
    objectiveStarted?: ReadWriteChannel<void>
  }) {
    Object.assign(this, params);
  }

  // SignalObjectiveStarted is used by the engine to signal the objective has been started.
  signalObjectiveStarted(): void { }

  // WaitForObjectiveToStart blocks until the objective starts
  waitForObjectiveToStart(): void { }

  // Id returns the objective id for the request.
  id(myAddress: Address, chainId: bigint): ObjectiveId {
    const fixedPart: FixedPart = new FixedPart({
      participants: [myAddress, this.counterParty],
      channelNonce: this.nonce,
      challengeDuration: this.challengeDuration,
    });

    const channelId: Destination = fixedPart.channelId();
    return `${objectivePrefix}${channelId.string()}` as ObjectiveId;
  }

  // Response computes and returns the appropriate response from the request.
  response(myAddress: Address, chainId: bigint): ObjectiveResponse {
    return {} as ObjectiveResponse;
  }
}
