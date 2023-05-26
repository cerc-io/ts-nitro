import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';

import { Exit } from '../../channel/state/outcome/exit';
import { Address, Funds } from '../../types/types';
import { ObjectiveId, ObjectivePayload, PayloadType } from '../messages';
import { FixedPart, State } from '../../channel/state/state';
import {
  ObjectiveStatus, ObjectiveRequest as ObjectiveRequestInterface, Objective as ObjectiveInterface, SideEffects, WaitingFor, Storable,
} from '../interfaces';
import * as channel from '../../channel/channel';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { SignedState } from '../../channel/state/signedstate';

const signedStatePayload: PayloadType = 'SignedStatePayload';

const objectivePrefix = 'DirectDefunding-';

interface GetChannelsByParticipantFunction {
  (participant: Address): channel.Channel[];
}

interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): ConsensusChannel;
}

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
    Object.assign(this);
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

    // TODO: Implement ConstructFromPayload method
    // const objective = ConstructFromPayload(
    //   preApprove, objectivePayload, myAddress
    // );

    // TODO: Implement channelsExistWithCounterparty method
    // if (channelsExistWithCounterparty(request.CounterParty, getChannels, getTwoPartyConsensusLedger)) {
    //   throw new Error(`A channel already exists with counterparty ${request.CounterParty}`);
    // }

    return new Objective({});
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

  outcome: Exit = [];

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
    const fixedPart: FixedPart = new FixedPart(
      [myAddress, this.counterParty],
      this.nonce,
      this.challengeDuration,
    );

    const channelId: string = fixedPart.channelId();
    return `${objectivePrefix}${channelId.toString()}` as ObjectiveId;
  }

  // Response computes and returns the appropriate response from the request.
  response(myAddress: Address, chainId: bigint): ObjectiveResponse {
    return {} as ObjectiveResponse;
  }
}
