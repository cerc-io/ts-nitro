import _ from 'lodash';

import { NitroSigner } from '@cerc-io/nitro-util';

import { Destination } from '../types/destination';
import { Address } from '../types/types';
import { Voucher, VoucherInfo } from './vouchers';

// VoucherStore is an interface for storing voucher information that the voucher manager expects.
// To avoid import cycles, this interface is defined in the payments package, but implemented in the store package.
export interface VoucherStore {
  setVoucherInfo (channelId: Destination, v: VoucherInfo): void | Promise<void>

  getVoucherInfo(channelId: Destination): VoucherInfo | Promise<VoucherInfo>

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

    let v: VoucherInfo | undefined;
    try {
      v = await this.store.getVoucherInfo(channelId);
    } catch (err) {
      await this.store.setVoucherInfo(channelId, data);
    }

    if (v !== undefined) {
      throw new Error('Channel already registered');
    }
  }

  // Remove deletes the channel's status
  remove(channelId: Destination): void {
    this.store.removeVoucherInfo(channelId);
  }

  // Pay will deduct amount from balance and add it to paid, returning a signed voucher for the
  // total amount paid.
  async pay(channelId: Destination, amount: bigint | undefined, signer: NitroSigner): Promise<Voucher> {
    let vInfo: VoucherInfo;
    try {
      vInfo = await this.store.getVoucherInfo(channelId);
    } catch (err) {
      throw new Error(`channel not registered: ${err}`);
    }

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

    await voucher.sign(signer);

    await this.store.setVoucherInfo(channelId, vInfo);

    return voucher;
  }

  // Receive validates the incoming voucher, and returns the total amount received so far as well as the amount received from the voucher
  async receive(voucher: Voucher): Promise<[bigint | undefined, bigint | undefined]> {
    let vInfo: VoucherInfo;
    try {
      vInfo = await this.store.getVoucherInfo(voucher.channelId);
    } catch (err) {
      throw new Error(`channel not registered: ${err}`);
    }

    // We only care about vouchers when we are the recipient of the payment
    if (vInfo.channelPayee !== this.me) {
      throw new Error('can only receive vouchers if we\'re the payee');
    }

    if (BigInt(voucher.amount!) > vInfo.startingBalance!) {
      throw new Error('channel has insufficient funds');
    }

    let total = vInfo.largestVoucher.amount;

    if (!(BigInt(voucher.amount!) > total!)) {
      return [total, BigInt(0)];
    }

    const signer = voucher.recoverSigner();
    if (signer !== vInfo.channelPayer) {
      throw new Error(`wrong signer: ${signer}, ${vInfo.channelPayer}`);
    }

    // Check the difference between our largest voucher and this new one
    const delta = BigInt(voucher.amount!) - BigInt(total!);
    total = voucher.amount;
    vInfo.largestVoucher = voucher;

    await this.store.setVoucherInfo(voucher.channelId, vInfo);
    return [total, delta];
  }

  // ChannelRegistered returns  whether a channel has been registered with the voucher manager or not
  async channelRegistered(channelId: Destination): Promise<boolean> {
    try {
      await this.store.getVoucherInfo(channelId);
    } catch (err) {
      return false;
    }
    return true;
  }

  // Paid returns the total amount paid so far on a channel
  async paid(chanId: Destination): Promise<bigint | undefined> {
    let v: VoucherInfo;
    try {
      v = await this.store.getVoucherInfo(chanId);
    } catch (err) {
      throw new Error(`channel not registered: ${err}`);
    }

    return v.largestVoucher.amount;
  }

  // Remaining returns the remaining amount of funds in the channel
  async remaining(chanId: Destination): Promise<bigint | undefined> {
    let v: VoucherInfo;
    try {
      v = await this.store.getVoucherInfo(chanId);
    } catch (err) {
      throw new Error(`channel not registered: ${err}`);
    }

    const remaining = BigInt(v.startingBalance!) - BigInt(v.largestVoucher.amount!);
    return remaining;
  }
}
