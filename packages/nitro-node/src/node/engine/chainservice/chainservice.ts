import { ethers } from 'ethers';

import type { ReadChannel } from '@cerc-io/ts-channel';

import { Uint64, Uint } from '@cerc-io/nitro-util';
import { Bytes32 } from '@statechannels/nitro-protocol';

import { ChainTransaction, Objective } from '../../../protocols/interfaces';
import { Address } from '../../../types/types';
import { Destination } from '../../../types/destination';
import { FixedPart, VariablePart, stateFromFixedAndVariablePart } from '../../../channel/state/state';
import { Signature } from '../../../crypto/signatures';
import { Exit } from '../../../channel/state/outcome/exit';
import { SignedState } from '../../../channel/state/signedstate';

// ChainEvent dictates which methods all chain events must implement
export interface ChainEvent {
  channelID(): Destination
  blockNum(): Uint64
  txIndex(): Uint
}

interface CommonEventConstructorOptions {
  _channelID?: Destination
  _blockNum?: Uint64
  _txIndex?: Uint
}

// CommonEvent declares fields shared by all chain events
class CommonEvent implements ChainEvent {
  private _channelID: Destination = new Destination();

  _blockNum = BigInt(0);

  _txIndex = BigInt(0);

  constructor(params: CommonEventConstructorOptions) {
    Object.assign(this, params);
  }

  channelID(): Destination {
    return this._channelID;
  }

  blockNum(): Uint64 {
    return this._blockNum;
  }

  txIndex(): Uint {
    return this._txIndex;
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

  static newDepositedEvent(
    channelId: Destination,
    blockNum: Uint64,
    txIndex: Uint64,
    assetAddress: Address,
    nowHeld?: bigint,
  ): DepositedEvent {
    return new DepositedEvent(
      {
        nowHeld,
        asset: assetAddress,
        _channelID: channelId,
        _blockNum: blockNum,
        _txIndex: txIndex,
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

  // GetLastConfirmedBlockNum returns the highest blockNum that satisfies the chainservice's REQUIRED_BLOCK_CONFIRMATIONS
  getLastConfirmedBlockNum(): Promise<Uint64>;

  close(): Promise<void>;
}

// ConcludedEvent is an internal representation of the Concluded blockchain event
export class ConcludedEvent extends CommonEvent {
  string(): string {
    return `Channel ${this.channelID().string()} concluded at Block ${this._blockNum}`;
  }
}

export class ChallengeRegisteredEvent extends CommonEvent {
  canditate?: VariablePart;

  candidateSignatures?: Signature[];

  constructor(
    params: {
      canditate: VariablePart,
      candidateSignatures: Signature[]
    } & CommonEventConstructorOptions,
  ) {
    super(params);
    Object.assign(this, params);
  }

  // NewChallengeRegisteredEvent constructs a ChallengeRegisteredEvent
  static NewChallengeRegisteredEvent(
    channelId: Destination,
    blockNum: Uint64,
    txIndex: Uint64,
    variablePart: VariablePart,
    sigs: Signature[],
  ): ChallengeRegisteredEvent {
    return new ChallengeRegisteredEvent({
      _channelID: channelId,
      _blockNum: blockNum,
      _txIndex: txIndex,
      canditate: new VariablePart({
        appData: variablePart.appData,
        outcome: variablePart.outcome,
        turnNum: variablePart.turnNum,
        isFinal: variablePart.isFinal,
      }),
      candidateSignatures: sigs,
    });
  }

  // StateHash returns the statehash stored on chain at the time of the ChallengeRegistered Event firing.
  stateHash(fp: FixedPart): Bytes32 {
    return stateFromFixedAndVariablePart(fp, this.canditate!).hash();
  }

  // Outcome returns the outcome which will have been stored on chain in the adjudicator after the ChallengeRegistered Event fires.
  outcome(): Exit {
    return this.canditate?.outcome!;
  }

  // SignedState returns the signed state which will have been stored on chain in the adjudicator after the ChallengeRegistered Event fires.
  SignedState(fp: FixedPart): SignedState {
    const s = stateFromFixedAndVariablePart(fp, this.canditate!);
    const ss = SignedState.newSignedState(s);

    for (let i = 0; i < this.candidateSignatures!.length; i += 1) {
      const sig = this.candidateSignatures![i];
      ss.addSignature(sig);
    }

    return ss;
  }

  string(): string {
    return `CHALLENGE registered for Channel ${this.channelID().string()} at Block ${this._blockNum}`;
  }
}

// AllocationUpdated is an internal representation of the AllocationUpdated blockchain event
// The event includes the token address and amount at the block that generated the event
export class AllocationUpdatedEvent extends CommonEvent {
  assetAndAmount: AssetAndAmount;

  string(): string {
    return `Channel ${this.channelID().string()} has had allocation updated to ${this.assetAndAmount.string()} at Block ${this._blockNum}`;
  }

  static newAllocationUpdatedEvent(channelId: Destination, blockNum: Uint64, txIndex: Uint64, assetAddress: Address, assetAmount: bigint | undefined): AllocationUpdatedEvent {
    return new AllocationUpdatedEvent({ _channelID: channelId, _blockNum: blockNum, _txIndex: txIndex }, { assetAddress, assetAmount });
  }

  constructor(
    params: CommonEventConstructorOptions,
    assetAndAmountParams: AssetAndAmountConstructorOptions,
  ) {
    super(params);
    this.assetAndAmount = new AssetAndAmount(assetAndAmountParams);
  }
}
