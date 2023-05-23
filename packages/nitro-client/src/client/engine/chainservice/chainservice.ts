import { AddressLike } from 'ethers';
import { GoReceivingChannelPlaceholder } from '../../../go-channel';
import { ChainTransaction } from '../../../protocols/interfaces';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID (): string
}

// TODO: Add eth chainservice implementation
export interface ChainService {
  eventFeed (): GoReceivingChannelPlaceholder<ChainEvent>;

  // TODO: Use protocols chain transaction type
  // TODO: Can throw an error
  sendTransaction (tx: ChainTransaction): void;

  // TODO: Use Address type
  getConsensusAppAddress (): AddressLike;

  getVirtualPaymentAppAddress (): AddressLike;

  // TODO: Can throw an error
  getChainId (): bigint;

  // TODO: Can throw an error
  close (): void;
}
