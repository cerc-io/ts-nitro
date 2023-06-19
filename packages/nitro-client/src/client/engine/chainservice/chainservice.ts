import type { ReadChannel } from '@nodeguy/channel';

import { ChainTransaction } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID (): string
}

// TODO: Implement
class AssetAndAmount {
  assetAddress?: Address;

  assetAmount?: bigint;
}

// TODO: Add eth chainservice implementation
export interface ChainService {
  eventFeed (): ReadChannel<ChainEvent>;

  // TODO: Use protocols chain transaction type
  // TODO: Can throw an error
  sendTransaction (tx: ChainTransaction): Promise<void>;

  // TODO: Use Address type
  getConsensusAppAddress (): Address;

  getVirtualPaymentAppAddress (): Address;

  // TODO: Can throw an error
  getChainId (): Promise<bigint>;

  // TODO: Can throw an error
  close (): void;
}

// AllocationUpdated is an internal representation of the AllocatonUpdated blockchain event
// The event includes the token address and amount at the block that generated the event
// TODO: Implement
export class AllocationUpdatedEvent {
  assetAndAmount?: AssetAndAmount;
}

// ConcludedEvent is an internal representation of the Concluded blockchain event
// TODO: Implement
export class ConcludedEvent {}
