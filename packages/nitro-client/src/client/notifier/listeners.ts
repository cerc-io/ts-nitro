import Channel, { ReadWriteChannel } from '@nodeguy/channel';

import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';

// paymentChannelListeners is a struct that holds a list of listeners for payment channel info.
export class PaymentChannelListeners {
  // listeners is a list of listeners for payment channel info that we need to notify.
  listeners: ReadWriteChannel<PaymentChannelInfo>[] = [];

  // prev is the previous payment channel info that was sent to the listeners.
  prev: PaymentChannelInfo = new PaymentChannelInfo({});

  // TODO: Implement
  // listenersLock is used to protect against concurrent access to the listeners slice.
  // listenersLock *sync.Mutex

  constructor(params: {
    listeners?: ReadWriteChannel<PaymentChannelInfo>[];
    prev?: PaymentChannelInfo
  }) {
    Object.assign(this, params);
  }

  // newPaymentChannelListeners constructs a new payment channel listeners struct.
  static newPaymentChannelListeners(): PaymentChannelListeners {
    return new PaymentChannelListeners({ listeners: [] });
  }

  /* eslint-disable no-await-in-loop */
  // Notify notifies all listeners of a payment channel update.
  // It only notifies listeners if the new info is different from the previous info.
  async notify(info: PaymentChannelInfo): Promise<void> {
    if (this.prev?.equal(info)) {
      return;
    }

    for (const [, list] of this.listeners!.entries()) {
      await list.push(info);
    }
    this.prev = info;
  }
}

// ledgerChannelListeners is a struct that holds a list of listeners for ledger channel info.
export class LedgerChannelListeners {
  // listeners is a list of listeners for ledger channel info that we need to notify.
  listeners: ReadWriteChannel<LedgerChannelInfo>[] = [];

  // prev is the previous ledger channel info that was sent to the listeners.
  prev: LedgerChannelInfo = new LedgerChannelInfo({});

  // TODO: Implement
  // listenersLock is used to protect against concurrent access to the listeners slice.
  // listenersLock sync.Mutex

  constructor(params: {
    listeners?: ReadWriteChannel<LedgerChannelInfo>[];
    prev?: LedgerChannelInfo
  }) {
    Object.assign(this, params);
  }

  // newPaymentChannelListeners constructs a new payment channel listeners struct.
  static newLedgerChannelListeners(): LedgerChannelListeners {
    return new LedgerChannelListeners({ listeners: [] });
  }

  /* eslint-disable no-await-in-loop */
  // Notify notifies all listeners of a ledger channel update.
  // It only notifies listeners if the new info is different from the previous info.
  async notify(info: LedgerChannelInfo): Promise<void> {
    if (this.prev?.equal(info)) {
      return;
    }

    for (const [, list] of this.listeners!.entries()) {
      await list.push(info);
    }
    this.prev = info;
  }
}
