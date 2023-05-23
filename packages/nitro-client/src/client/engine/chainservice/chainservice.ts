import { GoReceivingChannelPlaceholder } from '../../../go-channel';
import { ChainTransaction } from '../../../protocols/interfaces';

// Event dictates which methods all chain events must implement
export interface Event {
  channelID (): string
}

// TODO: Add eth chainservice implementation
export interface ChainService {
  eventFeed (): GoReceivingChannelPlaceholder<Event>;

  // TODO: Use protocols chain transaction type
  // TODO: Can throw an error
  sendTransaction (tx: ChainTransaction): void;

  // TODO: Use Address type
  getConsensusAppAddress (): string;

  getVirtualPaymentAppAddress (): string;

  // TODO: Can throw an error
  getChainId (): bigint;

  // TODO: Can throw an error
  close (): void;
}
