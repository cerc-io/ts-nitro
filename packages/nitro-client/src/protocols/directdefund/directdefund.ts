import { ReadWriteChannel } from '@nodeguy/channel';

import { Destination } from '../../types/destination';
import { ConsensusChannel } from '../../channel/consensus-channel/consensus-channel';
import { Channel } from '../../channel/channel';

// GetConsensusChannel describes functions which return a ConsensusChannel ledger channel for a channel id.
type GetConsensusChannel = (channelId: Destination) => [ConsensusChannel | undefined, Error];

// isInConsensusOrFinalState returns true if the channel has a final state or latest state that is supported
// TODO: Implement
const isInConsensusOrFinalState = (c: Channel): boolean => false;

export class Objective {
  // NewObjective initiates an Objective with the supplied channel
  static newObjective(
    request: ObjectiveRequest,
    preApprove: boolean,
    getConsensusChannel: GetConsensusChannel,
  ): Objective {
    // TODO: Implement
    return new Objective();
  }
}

// createChannelFromConsensusChannel creates a Channel with (an appropriate latest supported state) from the supplied ConsensusChannel.
// TODO: Implement
const createChannelFromConsensusChannel = (cc: ConsensusChannel): Channel => new Channel({});

// ObjectiveRequest represents a request to create a new direct defund objective.
// TODO: Implement
export class ObjectiveRequest {
  channelId?: string;

  private objectiveStarted?: ReadWriteChannel<void>;

  // NewObjectiveRequest creates a new ObjectiveRequest.
  static newObjectiveRequest(channelId: Destination): ObjectiveRequest {
    return new ObjectiveRequest();
  }
}
