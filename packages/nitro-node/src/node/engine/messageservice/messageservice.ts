import { ReadChannel } from '@cerc-io/ts-channel';

import { Message } from '../../../protocols/messages';

// TODO: Add tests
export interface MessageService {

  // P2PMessages returns a chan for receiving messages from the message service
  p2pMessages (): ReadChannel<Message>;

  // Send is for sending messages with the message service
  send (msg: Message): Promise<void>;

  // Close closes the message service
  close (): Promise<void>;
}
