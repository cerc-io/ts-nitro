// ChannelNotifier is used to notify multiple listeners of a channel update.

import { VoucherManager } from '../../payments/voucher-manager';
import { Store } from '../engine/store/store';
import { PaymentChannelListeners, LedgerChannelListeners } from './listeners';
import { SafeSyncMap } from '../../internal/safesync/safesync';
import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';
import { Destination } from '../../types/destination';

const ALL_NOTIFICATIONS = 'all';

// ChannelNotifier is used to notify multiple listeners of a channel update.
export class ChannelNotifier {
  private ledgerListeners?: SafeSyncMap<LedgerChannelListeners>;

  private paymentListeners?: SafeSyncMap<PaymentChannelListeners>;

  private store?: Store;

  private vm?: VoucherManager;

  constructor(params: {
    ledgerListeners: SafeSyncMap<LedgerChannelListeners>;
    paymentListeners: SafeSyncMap<PaymentChannelListeners>;
    store: Store;
    vm: VoucherManager;
  }) {
    Object.assign(this, params);
  }

  // NewChannelNotifier constructs a channel notifier using the provided store.
  static newChannelNotifier(store: Store, vm: VoucherManager): ChannelNotifier {
    return new ChannelNotifier({
      ledgerListeners: new SafeSyncMap<LedgerChannelListeners>(),
      paymentListeners: new SafeSyncMap<PaymentChannelListeners>(),
      store,
      vm,
    });
  }

  // RegisterForAllLedgerUpdates returns a buffered channel that will receive updates for all ledger channels.
  registerForAllLedgerUpdates() {
    const [li] = this.ledgerListeners!.loadOrStore(ALL_NOTIFICATIONS, LedgerChannelListeners.newLedgerChannelListeners());
    return li.getOrCreateListener();
  }

  // RegisterForLedgerUpdates returns a buffered channel that will receive updates or a specific ledger channel.
  registerForLedgerUpdates(cId: Destination) {
    const [li] = this.ledgerListeners!.loadOrStore(cId.string(), LedgerChannelListeners.newLedgerChannelListeners());
    return li.createNewListener();
  }

  // RegisterForAllPaymentUpdates returns a buffered channel that will receive updates for all payment channels.
  registerForAllPaymentUpdates() {
    const [li] = this.paymentListeners!.loadOrStore(ALL_NOTIFICATIONS, PaymentChannelListeners.newPaymentChannelListeners());
    return li.getOrCreateListener();
  }

  // RegisterForPaymentChannelUpdates returns a buffered channel that will receive updates or a specific payment channel.
  registerForPaymentChannelUpdates(cId: Destination) {
    const [li] = this.paymentListeners!.loadOrStore(cId.string(), PaymentChannelListeners.newPaymentChannelListeners());
    return li.createNewListener();
  }

  // NotifyLedgerUpdated notifies all listeners of a ledger channel update.
  // It should be called whenever a ledger channel is updated.
  notifyLedgerUpdated(info: LedgerChannelInfo): void {
    const [li] = this.ledgerListeners!.loadOrStore(info.iD.string(), LedgerChannelListeners.newLedgerChannelListeners());
    li.notify(info);

    const [allLi] = this.ledgerListeners!.loadOrStore(ALL_NOTIFICATIONS, LedgerChannelListeners.newLedgerChannelListeners());
    allLi.notify(info);
  }

  // NotifyPaymentUpdated notifies all listeners of a payment channel update.
  // It should be called whenever a payment channel is updated.
  notifyPaymentUpdated(info: PaymentChannelInfo): void {
    const [li] = this.paymentListeners!.loadOrStore(info.iD.string(), PaymentChannelListeners.newPaymentChannelListeners());
    li.notify(info);

    const [allLi] = this.paymentListeners!.loadOrStore(ALL_NOTIFICATIONS, PaymentChannelListeners.newPaymentChannelListeners());
    allLi.notify(info);
  }

  async close(): Promise<void> {
    await this.ledgerListeners!.range(async (k: string, v: LedgerChannelListeners): Promise<boolean> => {
      await v.close();
      return true;
    });

    await this.paymentListeners!.range(async (k: string, v: PaymentChannelListeners): Promise<boolean> => {
      await v.close();
      return true;
    });
  }
}
