import { ethers } from 'ethers';

import type { ReadChannel } from '@nodeguy/channel';

import { ChainTransaction } from '../../../protocols/interfaces';
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

  assetAmount?: bigint;

  constructor(params: AssetAndAmountConstructorOptions) {
    Object.assign(this, params);
  }
}

// DepositedEvent is an internal representation of the deposited blockchain event
export class DepositedEvent extends CommonEvent {
  nowHeld?: bigint;

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
