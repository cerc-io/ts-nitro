// ChannelNotifier is used to notify multiple listeners of a channel update.

import { VoucherManager } from '../../payments/voucher-manager';
import { Store } from '../engine/store/store';

// TODO: Implement
export class ChannelNotifier {
  // NewChannelNotifier constructs a channel notifier using the provided store.
  static newChannelNotifier(store: Store, vm: VoucherManager): ChannelNotifier {
    // TODO: Implement
    return new ChannelNotifier();
  }
}
