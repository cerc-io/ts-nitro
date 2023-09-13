import { ethers } from 'ethers';

import type { ReadChannel } from '@cerc-io/ts-channel';

import { Uint64 } from '@cerc-io/nitro-util';

import { ChainTransaction, Objective } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID(): Destination
  blockNum(): Uint64
}

interface CommonEventConstructorOptions {
  _channelID?: Destination
  _blockNum?: Uint64
}

// CommonEvent declares fields shared by all chain events
class CommonEvent implements ChainEvent {
  private _channelID: Destination = new Destination();

  _blockNum = BigInt(0);

  constructor(params: CommonEventConstructorOptions) {
    Object.assign(this, params);
  }

  channelID(): Destination {
    return this._channelID;
  }

  blockNum(): Uint64 {
    return this._blockNum;
  }
}

interface AssetAndAmountConstructorOptions {
  assetAddress?: Address
  assetAmount?: bigint
}

class AssetAndAmount {
  assetAddress: Address = ethers.constants.AddressZero;

  assetAmount?: bigint = undefined;

  constructor(params: AssetAndAmountConstructorOptions) {
    Object.assign(this, params);
  }

  string(): string {
    return `${this.assetAmount!.toString()} units of ${this.assetAddress} token`;
  }
}

// DepositedEvent is an internal representation of the deposited blockchain event
export class DepositedEvent extends CommonEvent {
  nowHeld?: bigint = undefined;

  asset: Address = ethers.constants.AddressZero;

  constructor(
    params: {
      nowHeld?: bigint,
      asset: Address
    } & CommonEventConstructorOptions,
  ) {
    super(params);
    Object.assign(this, params);
  }

  static newDepositedEvent(channelId: Destination, blockNum: Uint64, assetAddress: Address, nowHeld?: bigint): DepositedEvent {
    return new DepositedEvent(
      {
        nowHeld,
        asset: assetAddress,
        _channelID: channelId,
        _blockNum: blockNum,
      },
    );
  }

  string(): string {
    /* eslint-disable max-len */
    return `Deposited ${this.asset} leaving ${this.nowHeld!.toString()} now held against channel ${this.channelID().string()} at Block ${this._blockNum}`;
  }
}

// ChainEventHandler describes an objective that can handle chain events
export interface ChainEventHandler {
  updateWithChainEvent(event: ChainEvent): Objective
}

export interface ChainService {
  eventFeed(): ReadChannel<ChainEvent>;

  sendTransaction(tx: ChainTransaction): Promise<void>;

  getConsensusAppAddress(): Address;

  getVirtualPaymentAppAddress(): Address;

  getChainId(): Promise<bigint>;

  close(): Promise<void>;
}

// ConcludedEvent is an internal representation of the Concluded blockchain event
export class ConcludedEvent extends CommonEvent {
  string(): string {
    return `Channel ${this.channelID().string()} concluded at Block ${this._blockNum}`;
  }
}

class ChallengeEvent extends CommonEvent {

  // TODO fill out other fields
}

// AllocationUpdated is an internal representation of the AllocationUpdated blockchain event
// The event includes the token address and amount at the block that generated the event
export class AllocationUpdatedEvent extends CommonEvent {
  assetAndAmount: AssetAndAmount;

  string(): string {
    return `Channel ${this.channelID().string()} has had allocation updated to ${this.assetAndAmount.string()} at Block ${this._blockNum}`;
  }

  static newAllocationUpdatedEvent(channelId: Destination, blockNum: Uint64, assetAddress: Address, assetAmount: bigint | undefined): AllocationUpdatedEvent {
    return new AllocationUpdatedEvent({ _channelID: channelId, _blockNum: blockNum }, { assetAddress, assetAmount });
  }

  constructor(
    params: CommonEventConstructorOptions,
    assetAndAmountParams: AssetAndAmountConstructorOptions,
  ) {
    super(params);
    this.assetAndAmount = new AssetAndAmount(assetAndAmountParams);
  }
}
