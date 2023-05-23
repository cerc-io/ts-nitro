import { AddressLike } from 'ethers';

// A Voucher signed by Alice can be used by Bob to redeem payments in case of
// a misbehaving Alice.
//
// During normal operation, Alice & Bob would terminate the channel with an
// outcome reflecting the largest amount signed by Alice. For instance,
//   - if the channel started with balances {alice: 100, bob: 0}
//   - and the biggest voucher signed by alice had amount = 20
//   - then Alice and Bob would cooperatively conclude the channel with outcome
//     {alice: 80, bob: 20}
// TODO: Implement
export class Voucher {}

// VoucherInfo contains the largest voucher we've received on a channel.
// As well as details about the balance and who the payee/payer is.
// TODO: Implement
export class VoucherInfo {
  channelPayer?: AddressLike;

  channelPayee?: AddressLike;

  startingBalance?: bigint;

  largestVoucher?: Voucher;
}
