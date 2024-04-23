import Channel, { ReadWriteChannel } from '@cerc-io/ts-channel';
import { Mutex } from 'async-mutex';

import { LedgerChannelInfo, PaymentChannelInfo } from '../query/types';

// paymentChannelListeners is a struct that holds a list of listeners for payment channel info.
export class PaymentChannelListeners {
  // listeners is a list of listeners for payment channel info that we need to notify.
  listeners: ReadWriteChannel<PaymentChannelInfo>[] = [];

  // prev is the previous payment channel info that was sent to the listeners.
  prev: PaymentChannelInfo = new PaymentChannelInfo({});

  // listenersLock is used to protect against concurrent access to to sibling struct members.
  listenersLock = new Mutex();

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

  // Notify notifies all listeners of a payment channel update.
  // It only notifies listeners if the new info is different from the previous info.
  async notify(info: PaymentChannelInfo): Promise<void> {
    const release = await this.listenersLock.acquire();

    try {
      if (this.prev?.equal(info)) {
        return;
      }

      for await (const [, list] of this.listeners!.entries()) {
        await list.push(info);
      }
      this.prev = info;
    } finally {
      release();
    }
  }

  // createNewListener creates a new listener and adds it to the list of listeners.
  async createNewListener() {
    const release = await this.listenersLock.acquire();
    let listener;
    try {
      // Use a buffered channel to avoid blocking the notifier.
      listener = Channel<PaymentChannelInfo>(1000);
      this.listeners.push(listener);
    } finally {
      release();
    }
    return listener;
  }

  // getOrCreateListener returns the first listener, creating one if none exist.
  async getOrCreateListener() {
    const release = await this.listenersLock.acquire();
    if (this.listeners.length !== 0) {
      const l = this.listeners[0];
      release();
      return l;
    }

    release();
    return this.createNewListener();
  }

  async close(): Promise<void> {
    const release = await this.listenersLock.acquire();

    try {
      for (const c of this.listeners) {
        c.close();
      }
    } finally {
      release();
    }
  }
}

// ledgerChannelListeners is a struct that holds a list of listeners for ledger channel info.
export class LedgerChannelListeners {
  // listeners is a list of listeners for ledger channel info that we need to notify.
  listeners: ReadWriteChannel<LedgerChannelInfo>[] = [];

  // prev is the previous ledger channel info that was sent to the listeners.
  prev: LedgerChannelInfo = new LedgerChannelInfo({});

  // listenersLock is used to protect against concurrent access to sibling struct members.
  listenersLock = new Mutex();

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
    const release = await this.listenersLock.acquire();

    try {
      if (this.prev?.equal(info)) {
        return;
      }

      for (const [, list] of this.listeners!.entries()) {
        await list.push(info);
      }
      this.prev = info;
    } finally {
      release();
    }
  }

  // createNewListener creates a new listener and adds it to the list of listeners.
  async createNewListener() {
    const release = await this.listenersLock.acquire();
    let listener;
    try {
      // Use a buffered channel to avoid blocking the notifier.
      listener = Channel<LedgerChannelInfo>(1000);
      this.listeners.push(listener);
    } finally {
      release();
    }
    return listener;
  }

  // getOrCreateListener returns the first listener, creating one if none exist.
  async getOrCreateListener() {
    const release = await this.listenersLock.acquire();
    if (this.listeners.length !== 0) {
      const l = this.listeners[0];
      release();
      return l;
    }

    release();
    return this.createNewListener();
  }

  async close(): Promise<void> {
    const release = await this.listenersLock.acquire();

    try {
      for (const c of this.listeners) {
        c.close();
      }
    } finally {
      release();
    }
  }
}
