import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';

import { ethers } from 'ethers';
import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { Exit } from '../../channel/state/outcome/exit';
import { State } from '../../channel/state/state';
import { Funds } from '../../types/funds';
import { Address } from '../../types/types';
import {
  ObjectiveRequest as ObjectiveRequestInterface,
  Objective as ObjectiveInterface,
  ObjectiveStatus,
  SideEffects,
  WaitingFor,
  Storable,
} from '../interfaces';
import { ObjectiveId, ObjectivePayload } from '../messages';
import { VirtualChannel } from '../../channel/virtual';

// GetTwoPartyConsensusLedgerFuncion describes functions which return a ConsensusChannel ledger channel between
// the calling client and the given counterparty, if such a channel exists.
interface GetTwoPartyConsensusLedgerFunction {
  (counterparty: Address): [ConsensusChannel, boolean]
}

// TODO: Implement
export class Connection {
  // insertGuaranteeInfo mutates the receiver Connection struct.
  private insertGuaranteeInfo(a0: Funds, b0: Funds, vId: Destination, left: Destination, right: Destination) {}
}

// Objective is a cache of data computed by reading from the store. It stores (potentially) infinite data.
export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  v?: VirtualChannel;

  toMyLeft?: Connection;

  toMyRight?: Connection;

  private n: number = 0; // number of intermediaries

  myRole: number = 0; // index in the virtual funding protocol. 0 for Alice, n+1 for Bob. Otherwise, one of the intermediaries.

  private a0?: Funds; // Initial balance for Alice

  private b0?: Funds; // Initial balance for Bob

  // NewObjective creates a new virtual funding objective from a given request.
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    chainId: bigint,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    let rightCC: ConsensusChannel;
    let ok: boolean = false;

    if (request.intermediaries.length > 0) {
      [rightCC, ok] = getTwoPartyConsensusLedger(request.intermediaries[0]);
    } else {
      [rightCC, ok] = getTwoPartyConsensusLedger(request.counterParty);
    }

    if (!ok) {
      throw new Error(`Could not find ledger for ${myAddress} and ${request.intermediaries[0]}`);
    }

    const leftCC: ConsensusChannel = new ConsensusChannel({});

    const participants: Address[] = [myAddress, ...request.intermediaries, request.counterParty];

    const state = new State({
      participants,
      channelNonce: request.nonce,
      challengeDuration: request.challengeDuration,
      outcome: request.outcome,
      turnNum: 0,
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
  // TODO: Implement
  static constructFromState(
    preApprove: boolean,
    initialStateOfV: State,
    myAddress: Address,
    consensusChannelToMyLeft: ConsensusChannel,
    consensusChannelToMyRight: ConsensusChannel,
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
  getStatus(): ObjectiveStatus {
    return this.status;
  }
}

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
// TODO: Implement
export class ObjectiveResponse {}

// ObjectiveRequest represents a request to create a new virtual funding objective.
// TODO: Implement
export class ObjectiveRequest implements ObjectiveRequestInterface {
  intermediaries: Address[] = [];

  counterParty: Address = ethers.constants.AddressZero;

  challengeDuration: number = 0;

  outcome?: Exit;

  nonce: string = '0';

  appDefinition: Address = ethers.constants.AddressZero;

  private objectiveStarted?: ReadWriteChannel<null>;

  constructor(params: {
    intermediaries: Address[];
    counterParty: Address;
    challengeDuration: number;
    outcome?: Exit;
    nonce: string;
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
    nonce: string,
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

  id(address: Address, chainId: bigint): ObjectiveId {
    // TODO: Implement
    return '';
  }

  waitForObjectiveToStart(): void {
    // TODO: Implement
  }

  signalObjectiveStarted(): void {
    // TODO: Implement
  }

  // response computes and returns the appropriate response from the request.
  response(myAddress: Address): ObjectiveResponse {
    // TODO: Implement
    return new ObjectiveResponse();
  }
}
