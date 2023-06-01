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
// TODO: Implement
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

    // TODO: Implement
    const [v] = this.store.getVoucherInfo(channelId);
    if (!v) {
      throw new Error('Channel already registered');
    }

    this.store.setVoucherInfo(channelId, data);
  }

  // Remove deletes the channel's status
  // TODO: Can throw an error
  remove(channelId: string): void {}

  // Pay will deduct amount from balance and add it to paid, returning a signed voucher for the
  // total amount paid.
  // TODO: Can throw an error
  pay(channelId: string, amount: bigint, pk: string): Voucher {
    return new Voucher({});
  }

  // Receive validates the incoming voucher, and returns the total amount received so far
  // TODO: Can throw an error
  receive(voucher: Voucher): bigint {
    return BigInt(0);
  }

  // ChannelRegistered returns  whether a channel has been registered with the voucher manager or not
  channelRegistered(channelId: Destination): boolean {
    return false;
  }

  // Paid returns the total amount paid so far on a channel
  // TODO: Can throw an error
  paid(chanId: Destination): bigint {
    return BigInt(0);
  }

  // Remaining returns the remaining amount of funds in the channel
  // TODO: Can throw an error
  remaining(chanId: Destination): bigint {
    return BigInt(0);
  }
}
