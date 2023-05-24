import type { ReadChannel } from '@nodeguy/channel';

import { ChainTransaction } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID (): string
}

// TODO: Add eth chainservice implementation
export interface ChainService {
  eventFeed (): ReadChannel<ChainEvent>;

  // TODO: Use protocols chain transaction type
  // TODO: Can throw an error
  sendTransaction (tx: ChainTransaction): void;

  // TODO: Use Address type
  getConsensusAppAddress (): Address;

  getVirtualPaymentAppAddress (): Address;

  // TODO: Can throw an error
  getChainId (): bigint;

  // TODO: Can throw an error
  close (): void;
}
