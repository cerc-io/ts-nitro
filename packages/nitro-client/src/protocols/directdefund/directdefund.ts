import { ReadWriteChannel } from '@nodeguy/channel';

// ObjectiveRequest represents a request to create a new direct defund objective.
// TODO: Implement
export class ObjectiveRequest {
  channelId?: string;

  private objectiveStarted?: ReadWriteChannel<void>;
}
