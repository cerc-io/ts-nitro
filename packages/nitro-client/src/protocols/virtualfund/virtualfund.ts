import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';

import { ethers } from 'ethers';
import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { Exit } from '../../channel/state/outcome/exit';
import { State } from '../../channel/state/state';
import { Funds } from '../../types/funds';
import { Address } from '../../types/types';
import { ObjectiveRequest as ObjectiveRequestInterface } from '../interfaces';
import { ObjectiveId } from '../messages';

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
export class Objective {
  // NewObjective creates a new virtual funding objective from a given request.
  // TODO: Implement
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    myAddress: Address,
    chainId: bigint,
    getTwoPartyConsensusLedger: GetTwoPartyConsensusLedgerFunction,
  ): Objective {
    return new Objective();
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
