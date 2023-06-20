import { ethers } from 'ethers';
import _ from 'lodash';

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

  paidSoFar: bigint = BigInt(0);

  remainingFunds: bigint = BigInt(0);

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

  hub: Address = ethers.constants.AddressZero;

  client: Address = ethers.constants.AddressZero;

  hubBalance: bigint = BigInt(0);

  clientBalance: bigint = BigInt(0);

  constructor(params: {
    assetAddress?: Address;
    hub?: Address;
    client?: Address;
    hubBalance?: bigint;
    clientBalance?: bigint;
  }) {
    Object.assign(this, params);
  }

  // Equal returns true if the other LedgerChannelBalance is equal to this one
  equal(other: LedgerChannelBalance): boolean {
    return this.assetAddress === other.assetAddress
    && this.hub === other.hub
    && this.client === other.client
    && this.hubBalance === other.hubBalance
    && this.clientBalance === other.clientBalance;
  }
}

// LedgerChannelInfo contains balance and status info about a ledger channel
export class LedgerChannelInfo {
  iD = new Destination();

  status: ChannelStatus = ChannelStatus.Proposed;

  balance: LedgerChannelBalance = new LedgerChannelBalance({});

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
