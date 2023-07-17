import { ReadChannel } from '@cerc-io/ts-channel';

import { Message } from '../../../protocols/messages';

// TODO: Add tests
export interface MessageService {

  // Out returns a chan for receiving messages from the message service
  out (): ReadChannel<Message>;

  // Send is for sending messages with the message service
  send (msg: Message): Promise<void>;

  // Close closes the message service
  close (): Promise<void>;
}
