// A Voucher signed by Alice can be used by Bob to redeem payments in case of
// a misbehaving Alice.
//
// During normal operation, Alice & Bob would terminate the channel with an
// outcome reflecting the largest amount signed by Alice. For instance,
//   - if the channel started with balances {alice: 100, bob: 0}
//   - and the biggest voucher signed by alice had amount = 20
//   - then Alice and Bob would cooperatively conclude the channel with outcome
//     {alice: 80, bob: 20}

import { ethers } from 'ethers';

import { Signature } from '../channel/state/state';
import { Address } from '../types/types';
import { Destination } from '../types/destination';

export class Voucher {
  channelId: Destination = new Destination();

  amount?: bigint;

  signature: Signature = {};

  constructor(params: {
    channelId?: Destination;
    amount?: bigint;
    signature?: Signature;
  }) {
    Object.assign(this, params);
  }

  // TODO: Can throw an error
  hash(): Buffer {
    // TODO: Implement
    return Buffer.from('');
  }

  // TODO: Can throw an error
  sign(pk: Buffer): void {
    // TODO: Implement
  }

  // TODO: Can throw an error
  // TODO: Implement
  recoverSigner(): Address {
    return ethers.constants.AddressZero;
  }

  // Equal returns true if the two vouchers have the same channel id, amount and signatures
  // TODO: Implement
  equal(other: Voucher): boolean {
    return false;
  }
}

// VoucherInfo contains the largest voucher we've received on a channel.
// As well as details about the balance and who the payee/payer is.
// TODO: Implement
export class VoucherInfo {
  channelPayer: Address = ethers.constants.AddressZero;

  channelPayee: Address = ethers.constants.AddressZero;

  startingBalance?: bigint;

  largestVoucher: Voucher = new Voucher({});

  constructor(params: {
    channelPayer: Address
    channelPayee: Address
    startingBalance?: bigint
    largestVoucher: Voucher
  }) {
    Object.assign(this, params);
  }

  // Paid is the amount of funds that already have been used as payments
  paid(): bigint {
    return BigInt(0);
  }

  // Remaining returns the amount of funds left to be used as payments
  remaining(): bigint {
    return BigInt(0);
  }
}
