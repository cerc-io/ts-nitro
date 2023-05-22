import { GoReceivingChannelPlaceholder } from '../../../go-channel';
import { ChainTransaction } from '../../../protocols/interfaces';

// Event dictates which methods all chain events must implement
// TODO: Add methods
export interface Event {}

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
  getChainId (): number;

  // TODO: Can throw an error
  close (): void;
}
