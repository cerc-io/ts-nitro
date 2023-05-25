import { Address } from '../../types/types';

export enum ChannelStatus {
  Proposed = 'Proposed',
  Open = 'Open',
  Closing = 'Closing',
  Complete = 'Complete',
}

// PaymentChannelBalance contains the balance of a uni-directional payment channel
export class PaymentChannelBalance {
  assetAddress?: Address;

  payee?: Address;

  payer?: Address;

  paidSoFar?: bigint;

  remainingFunds?: bigint;

  // Equal returns true if the other PaymentChannelBalance is equal to this one
  equal(other: PaymentChannelBalance): boolean {
    return false;
  }
}

// PaymentChannelInfo contains balance and status info about a payment channel
export class PaymentChannelInfo {
  iD?: string;

  status?: ChannelStatus;

  balance?: LedgerChannelBalance;

  // Equal returns true if the other PaymentChannelInfo is equal to this one
  equal(other: PaymentChannelInfo): boolean {
    return false;
  }
}

// LedgerChannelBalance contains the balance of a ledger channel
export class LedgerChannelBalance {
  assetAddress?: Address;

  hub?: Address;

  client?: Address;

  hubBalance?: bigint;

  clientBalance?: bigint;

  // Equal returns true if the other LedgerChannelBalance is equal to this one
  equal(other: LedgerChannelBalance): boolean {
    return false;
  }
}

// LedgerChannelInfo contains balance and status info about a ledger channel
export class LedgerChannelInfo {
  iD?: string;

  status?: ChannelStatus;

  balance?: LedgerChannelBalance;

  // Equal returns true if the other LedgerChannelInfo is equal to this one
  equal(other: LedgerChannelInfo): boolean {
    return false;
  }
}
