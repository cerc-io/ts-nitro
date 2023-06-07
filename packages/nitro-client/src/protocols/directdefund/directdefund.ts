import assert from 'assert';
import isEqual from 'lodash/isEqual';

import Channel, { ReadWriteChannel } from '@nodeguy/channel';

import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import * as channel from '../../channel/channel';
import {
  ObjectiveRequest as ObjectiveRequestInterface, Objective as ObjectiveInterface, SideEffects, WaitingFor, Storable, ObjectiveStatus,
} from '../interfaces';
import { ObjectiveId, ObjectivePayload } from '../messages';
import { Address } from '../../types/types';
import { SignedState } from '../../channel/state/signedstate';

const ObjectivePrefix = 'DirectDefunding-';

const ErrChannelUpdateInProgress = new Error('can only defund a channel when the latest state is supported or when the channel has a final state');
const ErrNoFinalState = new Error('cannot spawn direct defund objective without a final state');
const ErrNotEmpty = new Error('ledger channel has running guarantees');

// GetConsensusChannel describes functions which return a ConsensusChannel ledger channel for a channel id.
type GetConsensusChannel = (channelId: Destination) => ConsensusChannel | undefined;

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
    // TODO: Implement
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
    Number(cc.myIndex),
  );

  c.onChainFunding = cc.onChainFunding.clone();
  c.addSignedState(cc.supportedSignedState());

  return c;
};

export class Objective implements ObjectiveInterface {
  status: ObjectiveStatus = ObjectiveStatus.Unapproved;

  c?: channel.Channel;

  private finalTurnNum: number = 0;

  private transactionSubmitted: boolean = false; // whether a transition for the objective has been submitted or not

  // NewObjective initiates an Objective with the supplied channel
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    getConsensusChannel: GetConsensusChannel,
  ): Objective {
    let cc: ConsensusChannel;

    try {
      cc = getConsensusChannel(request.channelId) as ConsensusChannel;
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
    // TODO: Implement
    const canCreateObjective = isInConsensusOrFinalState(c);

    if (!canCreateObjective) {
      throw ErrChannelUpdateInProgress;
    }

    const init = new Objective();

    if (preApprove) {
      init.status = ObjectiveStatus.Approved;
    } else {
      init.status = ObjectiveStatus.Unapproved;
    }

    // TODO: Implement
    init.c = c.clone();

    // TODO: Implement
    const latestSS = c.latestSupportedState();

    if (!latestSS.isFinal) {
      init.finalTurnNum = latestSS.turnNum + 1;
    } else {
      init.finalTurnNum = latestSS.turnNum;
    }

    return init;
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
  update(payload: ObjectivePayload): Objective {
    return new Objective();
  }

  // does *not* accept an event, but *does* accept a pointer to a signing key; declare side effects; return an updated Objective
  // TODO: Implement
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
  // TODO: Implement
  getStatus(): ObjectiveStatus {
    return ObjectiveStatus.Unapproved;
  }
}

// ObjectiveRequest represents a request to create a new direct defund objective.
// TODO: Implement
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

  signalObjectiveStarted(): void {}
}
