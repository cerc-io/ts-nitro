import assert from 'assert';
import { Buffer } from 'buffer';
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
import cloneDeep from 'lodash/cloneDeep';

import Channel, { ReadWriteChannel } from '@cerc-io/ts-channel';
import {
  FieldDescription, JSONbigNative, Uint64, fromJSON, toJSON,
} from '@cerc-io/nitro-util';

import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import * as channel from '../../channel/channel';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  SideEffects,
  WaitingFor,
  Storable,
  ObjectiveStatus,
  errNotApproved,
  WithdrawAllTransaction,
} from '../interfaces';
import {
  Message, ObjectiveId, ObjectivePayload, PayloadType,
} from '../messages';
import { Address } from '../../types/types';
import { SignedState } from '../../channel/state/signedstate';
import { State } from '../../channel/state/state';
import { AllocationUpdatedEvent, ChainEvent, ConcludedEvent } from '../../client/engine/chainservice/chainservice';

const WaitingForFinalization: WaitingFor = 'WaitingForFinalization';
const WaitingForWithdraw: WaitingFor = 'WaitingForWithdraw';
const WaitingForNothing: WaitingFor = 'WaitingForNothing'; // Finished

const SignedStatePayload: PayloadType = 'SignedStatePayload';

const ObjectivePrefix = 'DirectDefunding-';

const ErrChannelUpdateInProgress = new Error('can only defund a channel when the latest state is supported or when the channel has a final state');
const ErrNoFinalState = new Error('cannot spawn direct defund objective without a final state');
const ErrNotEmpty = new Error('ledger channel has running guarantees');

// GetConsensusChannel describes functions which return a ConsensusChannel ledger channel for a channel id.
type GetConsensusChannel = (channelId: Destination) => (ConsensusChannel | undefined) | Promise<ConsensusChannel | undefined>;

// isInConsensusOrFinalState returns true if the channel has a final state or latest state that is supported
const isInConsensusOrFinalState = (c: channel.Channel): boolean => {
  let latestSS = new SignedState({});

  try {
    latestSS = c.latestSignedState();
  } catch (err) {
    // There are no signed states. We consider this as consensus
    if (err instanceof Error && err.message === 'No states are signed') {
      return true;
    }
  }

  if (latestSS.state().isFinal) {
    return true;
  }

  try {
    const latestSupportedState = c.latestSupportedState();

    return isEqual(latestSS.state(), latestSupportedState);
  } catch (err) {
    return false;
  }
};

// createChannelFromConsensusChannel creates a Channel with (an appropriate latest supported state) from the supplied ConsensusChannel.
const createChannelFromConsensusChannel = (cc: ConsensusChannel): channel.Channel => {
  const c = channel.Channel.new(
    cc.consensusVars().asState(cc.supportedSignedState().state().fixedPart()),
    cc.myIndex,
  );

  c.onChainFunding = cc.onChainFunding.clone();
  c.addSignedState(cc.supportedSignedState());

  return c;
};

export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  c?: channel.Channel;

  private finalTurnNum: Uint64 = BigInt(0);

  private transactionSubmitted: boolean = false; // whether a transition for the objective has been submitted or not

  // NOTE: Marshal -> Unmarshal is a lossy process. All channel data
  // (other than Id) from the field C is discarded
  static jsonEncodingMap: Record<string, FieldDescription> = {
    status: { type: 'number' },
    c: { type: 'class', value: Destination },
    finalTurnNum: { type: 'uint64' },
    transactionSumbmitted: { type: 'boolean' },
  };

  static fromJSON(data: string): Objective {
    // props has c.id as c and
    // transactionSumbmitted as a key instead of transactionSubmitted (typo from go-nitro custom serialization)
    const props = fromJSON(this.jsonEncodingMap, data, new Map([['transactionSumbmitted', 'transactionSubmitted']]));
    return new Objective(set(props, 'c', new channel.Channel({ id: props.c })));
  }

  toJSON(): any {
    // Use a custom object
    // (according to MarshalJSON implementation in go-nitro)
    return toJSON(
      Objective.jsonEncodingMap,
      set(cloneDeep(this), 'c', this.c!.id),
      new Map([['transactionSubmitted', 'transactionSumbmitted']]),
    );
  }

  constructor(params: {
    status?: ObjectiveStatus,
    c?: channel.Channel,
    finalTurnNum?: number,
    transactionSubmitted?: boolean,
  }) {
    Object.assign(this, params);
  }

  // NewObjective initiates an Objective with the supplied channel
  static async newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    getConsensusChannel: GetConsensusChannel,
  ): Promise<Objective> {
    let cc: ConsensusChannel;

    try {
      cc = await getConsensusChannel(request.channelId) as ConsensusChannel;
    } catch (err) {
      throw new Error(`could not find channel ${request.channelId}; ${err}`);
    }

    if (cc.fundingTargets().length !== 0) {
      throw ErrNotEmpty;
    }

    const c = createChannelFromConsensusChannel(cc);

    // We choose to disallow creating an objective if the channel has an in-progress update.
    // We allow the creation of of an objective if the channel has some final states.
    // In the future, we can add a restriction that only defund objectives can add final states to the channel.
    const canCreateObjective = isInConsensusOrFinalState(c);

    if (!canCreateObjective) {
      throw ErrChannelUpdateInProgress;
    }

    const init = new Objective({});

    if (preApprove) {
      init.status = ObjectiveStatus.Approved;
    } else {
      init.status = ObjectiveStatus.Unapproved;
    }

    init.c = c.clone();

    const latestSS = c.latestSupportedState();

    if (!latestSS.isFinal) {
      init.finalTurnNum = latestSS.turnNum + BigInt(1);
    } else {
      init.finalTurnNum = latestSS.turnNum;
    }

    return init;
  }

  /* eslint-disable @typescript-eslint/no-use-before-define */
  // ConstructObjectiveFromPayload takes in a state and constructs an objective from it.
  static async constructObjectiveFromPayload(
    p: ObjectivePayload,
    preapprove: boolean,
    getConsensusChannel: GetConsensusChannel,
  ): Promise<Objective> {
    let ss: SignedState;
    try {
      ss = getSignedStatePayload(p.payloadData);
    } catch (err) {
      throw new Error(`could not get signed state payload: ${err}`);
    }
    const s = ss.state();

    // Implicit in the wire protocol is that the message signalling
    // closure of a channel includes an isFinal state (in the 0 slot of the message)
    //
    if (!s.isFinal) {
      throw ErrNoFinalState;
    }

    s.fixedPart().validate();

    const cId = s.channelId();
    const request = ObjectiveRequest.newObjectiveRequest(cId);
    return this.newObjective(request, preapprove, getConsensusChannel);
  }

  id(): ObjectiveId {
    return `${ObjectivePrefix}${this.c!.id.string()}`;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  approve(): ObjectiveInterface {
    const updated = this.clone();
    // todo: consider case of o.Status == Rejected
    updated.status = ObjectiveStatus.Approved;

    return updated;
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  reject(): [ObjectiveInterface, SideEffects] {
    const updated = this.clone();
    updated.status = ObjectiveStatus.Rejected;
    const peer = this.c!.participants![1 - Number(this.c!.myIndex)];

    const sideEffects = new SideEffects({ messagesToSend: Message.createRejectionNoticeMessage(this.id(), peer) });
    return [updated, sideEffects];
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

  // Related returns a slice of related objects that need to be stored along with the objective
  related(): Storable[] {
    return [this.c!];
  }

  // returns an updated Objective (a copy, no mutation allowed), does not declare effects
  update(p: ObjectivePayload): ObjectiveInterface {
    if (this.id() !== p.objectiveId) {
      throw new Error(`event and objective Ids do not match: ${p.objectiveId} and ${this.id()} respectively`);
    }

    let ss: SignedState;
    try {
      /* eslint-disable @typescript-eslint/no-use-before-define */
      ss = getSignedStatePayload(p.payloadData);
    } catch (err) {
      throw new Error(`could not get signed state payload: ${err}`);
    }

    if (ss.signatures().length !== 0) {
      if (!ss.state().isFinal) {
        throw new Error('direct defund objective can only be updated with final states');
      }
      if (this.finalTurnNum !== ss.state().turnNum) {
        throw new Error(`expected state with turn number ${this.finalTurnNum}, received turn number ${ss.state().turnNum}`);
      }
    } else {
      throw new Error('event does not contain a signed state');
    }

    const updated = this.clone();
    updated.c!.addSignedState(ss);

    return updated;
  }

  // UpdateWithChainEvent updates the objective with observed on-chain data.
  //
  // Only Allocation Updated events are currently handled.
  updateWithChainEvent(event: ChainEvent): ObjectiveInterface {
    const updated = this.clone();

    switch (event.constructor) {
      case AllocationUpdatedEvent: {
        const e = event as AllocationUpdatedEvent;

        // todo: check block number
        updated.c!.onChainFunding.value.set(e.assetAndAmount!.assetAddress!, e.assetAndAmount!.assetAmount!);
        break;
      }
      case ConcludedEvent: {
        break;
      }
      default:
        throw new Error(`objective ${JSONbigNative.stringify(updated)} cannot handle event ${JSONbigNative.stringify(event)}`);
    }

    return updated;
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  crank(secretKey: Buffer): [Objective, SideEffects, WaitingFor] {
    const updated = this.clone();

    const sideEffects = new SideEffects({});

    if (updated.status !== ObjectiveStatus.Approved) {
      throw errNotApproved;
    }

    let latestSignedState: SignedState;
    try {
      latestSignedState = updated.c!.latestSignedState();
    } catch (err) {
      throw new Error('the channel must contain at least one signed state to crank the defund objective');
    }

    // Finalize and sign a state if no supported, finalized state exists
    if (!latestSignedState.state().isFinal || !latestSignedState.hasSignatureForParticipant(updated.c!.myIndex)) {
      const stateToSign = latestSignedState.state().clone();
      if (!stateToSign.isFinal) {
        stateToSign.turnNum += BigInt(1);
        stateToSign.isFinal = true;
      }

      let ss: SignedState;
      try {
        ss = updated.c!.signAndAddState(stateToSign, secretKey);
      } catch (err) {
        throw new Error(`could not sign final state ${err}`);
      }

      let messages: Message[];
      try {
        messages = Message.createObjectivePayloadMessage(updated.id(), ss, SignedStatePayload, ...this.otherParticipants());
      } catch (err) {
        throw new Error(`could not create payload message ${err}`);
      }

      sideEffects.messagesToSend.push(...messages);
    }

    let latestSupportedState: State;
    try {
      latestSupportedState = updated.c!.latestSupportedState();
    } catch (err) {
      throw new Error(`error finding a supported state: ${err}`);
    }

    if (!latestSupportedState.isFinal) {
      return [updated, sideEffects, WaitingForFinalization];
    }

    // Withdrawal of funds
    if (!updated.fullyWithdrawn()) {
      // The first participant in the channel submits the withdrawAll transaction
      if (Number(updated.c!.myIndex) === 0 && !updated.transactionSubmitted) {
        const withdrawAll = WithdrawAllTransaction.newWithdrawAllTransaction(updated.c!.id, latestSignedState);
        sideEffects.transactionsToSubmit.push(withdrawAll);
        updated.transactionSubmitted = true;
      }

      // Every participant waits for all channel funds to be distributed, even if the participant has no funds in the channel
      return [updated, sideEffects, WaitingForWithdraw];
    }

    updated.status = ObjectiveStatus.Completed;
    return [updated, sideEffects, WaitingForNothing];
  }

  // clone returns a deep copy of the receiver.
  clone(): Objective {
    const clone = new Objective({});
    clone.status = this.status;

    assert(this.c);
    const cClone = this.c.clone();
    clone.c = cClone;

    clone.finalTurnNum = this.finalTurnNum;
    clone.transactionSubmitted = this.transactionSubmitted;

    return clone;
  }

  // fullyWithdrawn returns true if the channel contains no assets on chain
  private fullyWithdrawn(): boolean {
    return !this.c!.onChainFunding.isNonZero();
  }

  // otherParticipants returns the participants in the channel that are not the current participant.
  private otherParticipants(): Address[] {
    const others: Address[] = [];
    (this.c!.participants ?? []).forEach((p, i) => {
      if (i !== Number(this.c!.myIndex)) {
        others.push(p);
      }
    });

    return others;
  }
}

// IsDirectDefundObjective inspects a objective id and returns true if the objective id is for a direct defund objective.
export function isDirectDefundObjective(id: ObjectiveId): boolean {
  return id.startsWith(ObjectivePrefix);
}

// ObjectiveRequest represents a request to create a new direct defund objective.
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

  signalObjectiveStarted(): void {
    assert(this.objectiveStarted);
    this.objectiveStarted.close();
  }
}

// getSignedStatePayload takes in a serialized signed state payload and returns the deserialized SignedState.
function getSignedStatePayload(b: Buffer): SignedState {
  let ss: SignedState;
  try {
    ss = SignedState.fromJSON(b.toString());
  } catch (err) {
    throw new Error(`could not unmarshal signed state: ${err}`);
  }

  return ss;
}
