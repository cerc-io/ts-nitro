import assert from 'assert';
import { Buffer } from 'buffer';
import _ from 'lodash';

import { Destination } from '../types/destination';
import { Address } from '../types/types';
import { Voucher, VoucherInfo } from './vouchers';

// VoucherStore is an interface for storing voucher information that the voucher manager expects.
// To avoid import cycles, this interface is defined in the payments package, but implemented in the store package.
export interface VoucherStore {
  setVoucherInfo (channelId: Destination, v: VoucherInfo): void

  getVoucherInfo (channelId: Destination): [VoucherInfo | undefined, boolean] | Promise<[VoucherInfo | undefined, boolean]>

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
  async register(channelId: Destination, payer: string, payee: string, startingBalance?: bigint): Promise<void> {
    const voucher = new Voucher({ channelId, amount: BigInt(0) });
    const data = new VoucherInfo({
      channelPayer: payer,
      channelPayee: payee,
      startingBalance: BigInt(startingBalance!),
      largestVoucher: voucher,
    });

    const [v] = await this.store.getVoucherInfo(channelId);
    if (v !== undefined) {
      throw new Error('Channel already registered');
    }

    this.store.setVoucherInfo(channelId, data);
  }

  // Remove deletes the channel's status
  remove(channelId: Destination): void {
    // TODO: Return error instead of panicking
    this.store.removeVoucherInfo(channelId);
  }

  // Pay will deduct amount from balance and add it to paid, returning a signed voucher for the
  // total amount paid.
  async pay(channelId: Destination, amount: bigint | undefined, pk: Buffer): Promise<Voucher> {
    const [vInfo, ok] = await this.store.getVoucherInfo(channelId);

    if (!ok) {
      throw new Error('channel not found');
    }

    assert(vInfo);

    if (amount! > vInfo.remaining()!) {
      throw new Error('unable to pay amount: insufficient funds');
    }

    if (vInfo.channelPayer !== this.me) {
      throw new Error("can only sign vouchers if we're the payer");
    }

    const newAmount: bigint = BigInt(vInfo.largestVoucher.amount!) + BigInt(amount!);
    const voucher = new Voucher({ amount: newAmount, channelId });

    // Use cloneDeep and Go structs are assigned by value
    vInfo.largestVoucher = _.cloneDeep(voucher);

    voucher.sign(pk);

    this.store.setVoucherInfo(channelId, vInfo);

    return voucher;
  }

  // Receive validates the incoming voucher, and returns the total amount received so far
  async receive(voucher: Voucher): Promise<bigint | undefined> {
    const [vInfo, ok] = await this.store.getVoucherInfo(voucher.channelId);
    if (!ok) {
      throw new Error('channel not registered');
    }
    assert(vInfo);

    // We only care about vouchers when we are the recipient of the payment
    if (vInfo.channelPayee !== this.me) {
      return BigInt(0);
    }

    const received = BigInt(voucher.amount!);
    if (received > vInfo.startingBalance!) {
      throw new Error('channel has insufficient funds');
    }

    const receivedSoFar = vInfo.largestVoucher.amount;
    if (!(received > receivedSoFar!)) {
      return receivedSoFar;
    }

    const signer = voucher.recoverSigner();
    if (signer !== vInfo.channelPayer) {
      throw new Error(`wrong signer: ${signer}, ${vInfo.channelPayer}`);
    }

    vInfo.largestVoucher = voucher;

    this.store.setVoucherInfo(voucher.channelId, vInfo);
    return received;
  }

  // ChannelRegistered returns  whether a channel has been registered with the voucher manager or not
  async channelRegistered(channelId: Destination): Promise<boolean> {
    const [, ok] = await this.store.getVoucherInfo(channelId);
    return ok;
  }

  // Paid returns the total amount paid so far on a channel
  async paid(chanId: Destination): Promise<bigint | undefined> {
    const [v, ok] = await this.store.getVoucherInfo(chanId);
    if (!ok) {
      throw new Error('channel not registered');
    }
    assert(v);

    return v.largestVoucher.amount;
  }

  // Remaining returns the remaining amount of funds in the channel
  async remaining(chanId: Destination): Promise<bigint | undefined> {
    const [v, ok] = await this.store.getVoucherInfo(chanId);
    if (!ok) {
      throw new Error('channel not registered');
    }
    assert(v);

    const remaining = BigInt(v.startingBalance!) - BigInt(v.largestVoucher.amount!);
    return remaining;
  }
}
