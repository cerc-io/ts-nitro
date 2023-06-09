import { ReadChannel } from '@cerc-io/ts-channel';

import { Message } from '../../../protocols/messages';

// TODO: Add p2p implementation
// TODO: Add tests
export interface MessageService {
  // TODO: Update comments

  // Out returns a chan for receiving messages from the message service
  out (): ReadChannel<Message>;

  // Send is for sending messages with the message service
  send (msg: Message): Promise<void>;

  // Close closes the message service
  // TODO: Can throw an error
  close (): Promise<void>;
}
