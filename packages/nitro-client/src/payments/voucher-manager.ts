import { AddressLike } from 'ethers';

import { Voucher, VoucherInfo } from './vouchers';

// VoucherStore is an interface for storing voucher information that the voucher manager expects.
// To avoid import cycles, this interface is defined in the payments package, but implemented in the store package.
export interface VoucherStore {
  // TODO: Can throw an error
  setVoucherInfo (channelId: string, v: VoucherInfo): void

  // TODO: Can throw an error
  getVoucherInfo (channelId: string): VoucherInfo

  // TODO: Can throw an error
  removeVoucherInfo (channelId: string): void
}

// VoucherInfo stores the status of payments for a given payment channel.
// VoucherManager receives and generates vouchers. It is responsible for storing vouchers.
// TODO: Implement
export class VoucherManager {
  private store: VoucherStore;

  private me: AddressLike;

  constructor(me: AddressLike, store: VoucherStore) {
    this.store = store;
    this.me = me;
  }

  // Register registers a channel for use, given the payer, payee and starting balance of the channel
  // TODO: Can throw an error
  register(channelId: string, payer: AddressLike, payee: AddressLike, startingBalance: bigint): void {}

  // Remove deletes the channel's status
  // TODO: Can throw an error
  remove(channelId: string): void {}

  // Pay will deduct amount from balance and add it to paid, returning a signed voucher for the
  // total amount paid.
  // TODO: Can throw an error
  pay(channelId: string, amount: bigint, pk: string): Voucher {
    return new Voucher();
  }

  // Receive validates the incoming voucher, and returns the total amount received so far
  // TODO: Can throw an error
  receive(voucher: Voucher): bigint {
    return BigInt(0);
  }

  // ChannelRegistered returns  whether a channel has been registered with the voucher manager or not
  channelRegistered(channelId: string): boolean {
    return false;
  }

  // Paid returns the total amount paid so far on a channel
  // TODO: Can throw an error
  paid(chanId: string): bigint {
    return BigInt(0);
  }

  // Remaining returns the remaining amount of funds in the channel
  // TODO: Can throw an error
  remaining(chanId: string): bigint {
    return BigInt(0);
  }
}
