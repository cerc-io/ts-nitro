import { ethers } from 'ethers';

import type { ReadChannel } from '@nodeguy/channel';

import { ChainTransaction, Objective } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID (): Destination
}

interface CommonEventConstructorOptions {
  _channelID?: Destination
  blockNum?: string
}

// CommonEvent declares fields shared by all chain events
class CommonEvent implements ChainEvent {
  private _channelID: Destination = new Destination();

  blockNum: string = '0';

  constructor(params: CommonEventConstructorOptions) {
    Object.assign(this, params);
  }

  channelID(): Destination {
    return this._channelID;
  }
}

interface AssetAndAmountConstructorOptions {
  assetAddress?: Address
  assetAmount?: bigint
}

class AssetAndAmount {
  assetAddress: Address = ethers.constants.AddressZero;

  assetAmount: bigint = BigInt(0);

  constructor(params: AssetAndAmountConstructorOptions) {
    Object.assign(this, params);
  }

  string(): string {
    return `${this.assetAmount.toString()} units of ${this.assetAddress} token`;
  }
}

// DepositedEvent is an internal representation of the deposited blockchain event
export class DepositedEvent extends CommonEvent {
  nowHeld: bigint = BigInt(0);

  // Workaround for extending multiple classes in TypeScript
  assetAndAmount: AssetAndAmount;

  constructor(
    params: {
      nowHeld?: bigint,
    } & CommonEventConstructorOptions,
    assetAndAmountParams: AssetAndAmountConstructorOptions,
  ) {
    super(params);
    Object.assign(this, params);
    this.assetAndAmount = new AssetAndAmount(assetAndAmountParams);
  }

  static newDepositedEvent(channelId: Destination, blockNum: string, assetAddress: Address, assetAmount: bigint, nowHeld: bigint): DepositedEvent {
    return new DepositedEvent(
      {
        _channelID: channelId,
        blockNum,
        nowHeld,
      },
      {
        assetAddress,
        assetAmount,
      },
    );
  }

  string(): string {
    /* eslint-disable max-len */
    return `Deposited ${this.assetAndAmount.string()} leaving ${this.nowHeld.toString()} now held against channel ${this.channelID().string()} at Block ${this.blockNum}`;
  }
}

// ChainEventHandler describes an objective that can handle chain events
export interface ChainEventHandler {
  updateWithChainEvent(event: ChainEvent): Objective
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

// ConcludedEvent is an internal representation of the Concluded blockchain event
export class ConcludedEvent extends CommonEvent {
  string(): string {
    return `Channel ${this.channelID().string()} concluded at Block ${this.blockNum}`;
  }
}

// AllocationUpdated is an internal representation of the AllocatonUpdated blockchain event
// The event includes the token address and amount at the block that generated the event
export class AllocationUpdatedEvent extends CommonEvent {
  assetAndAmount: AssetAndAmount;

  string(): string {
    return `Channel ${this.channelID().string()} has had allocation updated to ${this.assetAndAmount} at Block ${this.blockNum}`;
  }

  static newAllocationUpdatedEvent(channelId: Destination, blockNum: string, assetAddress: Address, assetAmount: bigint): AllocationUpdatedEvent {
    return new AllocationUpdatedEvent({ _channelID: channelId, blockNum }, { assetAddress, assetAmount });
  }

  constructor(
    params: CommonEventConstructorOptions,
    assetAndAmountParams: AssetAndAmountConstructorOptions,
  ) {
    super(params);
    this.assetAndAmount = new AssetAndAmount(assetAndAmountParams);
  }
}
