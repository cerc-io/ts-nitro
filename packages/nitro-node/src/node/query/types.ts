import { ethers } from 'ethers';
import _ from 'lodash';

import { FieldDescription, toJSON } from '@cerc-nitro/nitro-util';

import { Address } from '../../types/types';
import { Destination } from '../../types/destination';

export enum ChannelStatus {
  Proposed = 'Proposed',
  Open = 'Open',
  Closing = 'Closing',
  Complete = 'Complete',
}

// PaymentChannelBalance contains the balance of a uni-directional payment channel
export class PaymentChannelBalance {
  assetAddress: Address = ethers.constants.AddressZero;

  payee: Address = ethers.constants.AddressZero;

  payer: Address = ethers.constants.AddressZero;

  paidSoFar?: bigint = undefined;

  remainingFunds?: bigint = undefined;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    assetAddress: { type: 'address' },
    payee: { type: 'address' },
    payer: { type: 'address' },
    paidSoFar: { type: 'bigint' },
    remainingFunds: { type: 'bigint' },
  };

  toJSON(): any {
    return toJSON(PaymentChannelBalance.jsonEncodingMap, this);
  }

  constructor(params: {
    assetAddress?: Address;
    payee?: Address;
    payer?: Address;
    paidSoFar?: bigint;
    remainingFunds?: bigint;
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the other PaymentChannelBalance is equal to this one
  equal(other: PaymentChannelBalance): boolean {
    return this.assetAddress === other.assetAddress
    && this.payee === other.payee
    && this.payer === other.payer
    && this.paidSoFar === other.paidSoFar
    && this.remainingFunds === other.remainingFunds;
  }
}

// PaymentChannelInfo contains balance and status info about a payment channel
export class PaymentChannelInfo {
  iD: Destination = new Destination();

  status: ChannelStatus = ChannelStatus.Proposed;

  balance: PaymentChannelBalance = new PaymentChannelBalance({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    iD: { type: 'class', value: Destination },
    status: { type: 'string' },
    balance: { type: 'class', value: PaymentChannelBalance },
  };

  toJSON(): any {
    return toJSON(PaymentChannelInfo.jsonEncodingMap, this);
  }

  constructor(params: {
    iD?: Destination;
    status?: ChannelStatus;
    balance?: PaymentChannelBalance;
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the other PaymentChannelInfo is equal to this one
  equal(other: PaymentChannelInfo): boolean {
    return _.isEqual(this.iD, other.iD)
    && this.status === other.status
    && this.balance.equal(other.balance);
  }
}

// LedgerChannelBalance contains the balance of a ledger channel
export class LedgerChannelBalance {
  assetAddress: Address = ethers.constants.AddressZero;

  me: Address = ethers.constants.AddressZero;

  them: Address = ethers.constants.AddressZero;

  myBalance?: bigint = undefined;

  theirBalance?: bigint = undefined;

  static jsonEncodingMap: Record<string, FieldDescription> = {
    assetAddress: { type: 'address' },
    me: { type: 'address' },
    them: { type: 'address' },
    myBalance: { type: 'bigint' },
    theirBalance: { type: 'bigint' },
  };

  toJSON(): any {
    return toJSON(LedgerChannelBalance.jsonEncodingMap, this);
  }

  constructor(params: {
    assetAddress?: Address;
    me?: Address;
    them?: Address;
    myBalance?: bigint;
    theirBalance?: bigint;
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the other LedgerChannelBalance is equal to this one
  equal(other: LedgerChannelBalance): boolean {
    return this.assetAddress === other.assetAddress
      && this.them === other.them
      && this.me === other.me
      && this.theirBalance === other.theirBalance
      && this.myBalance === other.myBalance;
  }
}

// LedgerChannelInfo contains balance and status info about a ledger channel
export class LedgerChannelInfo {
  iD = new Destination();

  status: ChannelStatus = ChannelStatus.Proposed;

  balance: LedgerChannelBalance = new LedgerChannelBalance({});

  static jsonEncodingMap: Record<string, FieldDescription> = {
    iD: { type: 'class', value: Destination },
    status: { type: 'string' },
    balance: { type: 'class', value: LedgerChannelBalance },
  };

  toJSON(): any {
    return toJSON(PaymentChannelInfo.jsonEncodingMap, this);
  }

  constructor(params: {
    iD?: Destination;
    status?: ChannelStatus;
    balance?: LedgerChannelBalance;
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the other LedgerChannelInfo is equal to this one
  equal(other: LedgerChannelInfo): boolean {
    return _.isEqual(this.iD, other.iD)
    && this.status === other.status
    && this.balance.equal(other.balance);
  }
}
