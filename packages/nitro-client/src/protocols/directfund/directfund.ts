import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';

import assert from 'assert';
import { Exit } from '../../channel/state/outcome/exit';
import { Address } from '../../types/types';
import { Funds } from '../../types/funds';
import { ObjectiveId, ObjectivePayload, PayloadType } from '../messages';
import { FixedPart, State } from '../../channel/state/state';
import {
  ObjectiveStatus, ObjectiveRequest as ObjectiveRequestInterface, Objective as ObjectiveInterface, SideEffects, WaitingFor, Storable,
} from '../interfaces';
import * as channel from '../../channel/channel';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { SignedState } from '../../channel/state/signedstate';
import { Destination } from '../../types/destination';

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
const getSignedStatePayload = (b: Buffer): SignedState => new SignedState({});

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
    const b = Buffer.from(JSON.stringify(signedInitial), 'utf-8');
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

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Can throw an error
  // TODO: Implement
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
  ownsChannel(): string {
    return '';
  }

  // GetStatus returns the status of the objective.
  // TODO: Implement
  getStatus(): ObjectiveStatus {
    return this.status;
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
  waitForObjectiveToStart(): void {}

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
