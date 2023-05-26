import Channel from '@nodeguy/channel';
import type { ReadWriteChannel } from '@nodeguy/channel';

import { Exit } from '../../channel/state/outcome/exit';
import { Address } from '../../types/types';
import { ObjectiveId } from '../messages';
import { FixedPart } from '../../channel/state/state';

const ObjectivePrefix = 'DirectDefunding-';

// ObjectiveResponse is the type returned across the API in response to the ObjectiveRequest.
export type ObjectiveResponse = {
  id: ObjectiveId
  channelId: string
};

// ObjectiveRequest represents a request to create a new direct funding objective.
export class ObjectiveRequest {
  counterParty: Address;

  // TODO: uint32 replacement
  challengeDuration: number;

  outcome: Exit;

  appDefinition: Address;

  appData?: Buffer;

  nonce: string;

  private objectiveStarted: ReadWriteChannel<void>;

  constructor(
    counterParty: Address,
    challengeDuration: number,
    outcome: Exit,
    nonce: string,
    appDefinition: Address,
  ) {
    this.counterParty = counterParty;
    this.challengeDuration = challengeDuration;
    this.outcome = outcome;
    this.nonce = nonce;
    this.appDefinition = appDefinition;
    this.objectiveStarted = Channel();
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
    return `${ObjectivePrefix}${channelId.toString()}` as ObjectiveId;
  }

  // Response computes and returns the appropriate response from the request.
  response(myAddress: Address, chainId: bigint): ObjectiveResponse {
    return {} as ObjectiveResponse;
  }
}
