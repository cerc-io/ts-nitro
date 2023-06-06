// ChannelNotifier is used to notify multiple listeners of a channel update.

import { VoucherManager } from '../../payments/voucher-manager';
import { Store } from '../engine/store/store';
import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';

// TODO: Implement
export class ChannelNotifier {
  // NewChannelNotifier constructs a channel notifier using the provided store.
  static newChannelNotifier(store: Store, vm: VoucherManager): ChannelNotifier {
    // TODO: Implement
    return new ChannelNotifier();
  }

  // NotifyLedgerUpdated notifies all listeners of a ledger channel update.
  // It should be called whenever a ledger channel is updated.
  // TODO: Implement
  notifyLedgerUpdated(info: LedgerChannelInfo) {}

  // NotifyPaymentUpdated notifies all listeners of a payment channel update.
  // It should be called whenever a payment channel is updated.
  // TODO: Implement
  notifyPaymentUpdated(info: PaymentChannelInfo) {}
}
