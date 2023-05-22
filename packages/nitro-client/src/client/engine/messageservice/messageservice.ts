import { GoReceivingChannelPlaceholder } from '../../../go-channel';
import { Message } from '../../../protocols/messages';

// TODO: Add p2p implementation
// TODO: Add tests
export interface MessageService {
  // TODO: Update comments

  // Out returns a chan for receiving messages from the message service
  out (): GoReceivingChannelPlaceholder<Message>;

  // Send is for sending messages with the message service
  // TODO: Use protocols message type
  send (msg: Message): void;

  // Close closes the message service
  // TODO: Can throw an error
  close (): void;
}
