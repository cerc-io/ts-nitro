import debug from 'debug';

import type { ReadWriteChannel } from '@nodeguy/channel';

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager } from '../payments/voucher-manager';
import { Engine } from './engine/engine';
import { Address } from '../types/types';
import { ChannelNotifier } from './notifier/channel-notifier';
import { ObjectiveId } from '../protocols/messages';
import { SyncMap } from '../internal/safesync/safesync';
import { Voucher } from '../payments/vouchers';
import { MetricsApi } from './engine/metrics';

const log = debug('ts-nitro:client');

export class Client {
  // The core business logic of the client
  private engine?: Engine;

  private address?: Address;

  private channelNotifier?: ChannelNotifier;

  private completedObjectivesForRPC?: ReadWriteChannel<ObjectiveId>;

  private completedObjectives?: SyncMap<ReadWriteChannel<null>>;

  private failedObjectives?: ReadWriteChannel<ObjectiveId>;

  private receivedVouchers?: ReadWriteChannel<Voucher>;

  private chainId?: bigint;

  private store?: Store;

  private vm?: VoucherManager;

  private logger?: debug.Debugger;

  static new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    logDestination: WritableStream,
    policymaker: PolicyMaker,
    metricsApi: MetricsApi,
  ): Client {
    // TODO: Port over implementation
    return new Client();
  }
}
