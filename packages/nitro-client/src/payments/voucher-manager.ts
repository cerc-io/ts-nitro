import assert from 'assert';
import { Buffer } from 'buffer';

import { Destination } from '../types/destination';
import { Address } from '../types/types';
import { Voucher, VoucherInfo } from './vouchers';

// VoucherStore is an interface for storing voucher information that the voucher manager expects.
// To avoid import cycles, this interface is defined in the payments package, but implemented in the store package.
export interface VoucherStore {
  // TODO: Can throw an error
  setVoucherInfo (channelId: Destination, v: VoucherInfo): void

  // TODO: Can throw an error
  getVoucherInfo (channelId: Destination): [VoucherInfo | undefined, boolean]

  // TODO: Can throw an error
  removeVoucherInfo (channelId: Destination): void
}

// VoucherInfo stores the status of payments for a given payment channel.
// VoucherManager receives and generates vouchers. It is responsible for storing vouchers.
export class VoucherManager {
  private store: VoucherStore;

  private me: string;

  constructor(me: string, store: VoucherStore) {
    this.store = store;
    this.me = me;
  }

  // NewVoucherManager creates a new voucher manager
  static newVoucherManager(me: Address, store: VoucherStore): VoucherManager {
    return new VoucherManager(me, store);
  }

  // Register registers a channel for use, given the payer, payee and starting balance of the channel
  register(channelId: Destination, payer: string, payee: string, startingBalance: bigint): void {
    const voucher = new Voucher({ channelId, amount: BigInt(0) });
    const data = new VoucherInfo({
      channelPayer: payer,
      channelPayee: payee,
      startingBalance: BigInt(startingBalance),
      largestVoucher: voucher,
    });

    const [v] = this.store.getVoucherInfo(channelId);
    if (v !== undefined) {
      throw new Error('Channel already registered');
    }

    this.store.setVoucherInfo(channelId, data);
  }

  // Remove deletes the channel's status
  // TODO: Can throw an error
  remove(channelId: string): void {}

  // Pay will deduct amount from balance and add it to paid, returning a signed voucher for the
  // total amount paid.
  async pay(channelId: Destination, amount: bigint, pk: Buffer): Promise<Voucher> {
    const [vInfo, ok] = this.store.getVoucherInfo(channelId);

    if (!ok) {
      throw new Error('channel not found');
    }

    assert(vInfo);

    if (amount > vInfo.remaining()) {
      throw new Error('unable to pay amount: insufficient funds');
    }

    if (vInfo.channelPayer !== this.me) {
      throw new Error("can only sign vouchers if we're the payer");
    }

    const newAmount: bigint = vInfo.largestVoucher.amount + amount;
    const voucher = new Voucher({ amount: newAmount, channelId });

    vInfo.largestVoucher = voucher;

    await voucher.sign(pk);

    this.store.setVoucherInfo(channelId, vInfo);

    return voucher;
  }

  // Receive validates the incoming voucher, and returns the total amount received so far
  // TODO: Can throw an error
  receive(voucher: Voucher): bigint {
    return BigInt(0);
  }

  // ChannelRegistered returns  whether a channel has been registered with the voucher manager or not
  channelRegistered(channelId: Destination): boolean {
    const [, ok] = this.store.getVoucherInfo(channelId);
    return ok;
  }

  // Paid returns the total amount paid so far on a channel
  paid(chanId: Destination): bigint {
    const [v, ok] = this.store.getVoucherInfo(chanId);
    if (!ok) {
      throw new Error('channel not registered');
    }
    assert(v);

    return v.largestVoucher.amount;
  }

  // Remaining returns the remaining amount of funds in the channel
  remaining(chanId: Destination): bigint {
    const [v, ok] = this.store.getVoucherInfo(chanId);
    if (!ok) {
      throw new Error('channel not registered');
    }
    assert(v);

    const remaining = v.startingBalance - v.largestVoucher.amount;
    return remaining;
  }
}
