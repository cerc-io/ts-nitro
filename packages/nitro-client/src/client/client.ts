import debug from 'debug';
import assert from 'assert';

import type { ReadWriteChannel } from '@nodeguy/channel';
import Channel from '@nodeguy/channel';
import { go, randUint64 } from '@cerc-io/nitro-util';

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager } from '../payments/voucher-manager';
import { Engine } from './engine/engine';
import { Address } from '../types/types';
import { ChannelNotifier } from './notifier/channel-notifier';
import { ObjectiveId } from '../protocols/messages';
import { SafeSyncMap } from '../internal/safesync/safesync';
import { Voucher } from '../payments/vouchers';
import { MetricsApi, NoOpMetrics } from './engine/metrics';
import { Exit } from '../channel/state/outcome/exit';
import {
  ObjectiveResponse as DirectFundObjectiveResponse,
  ObjectiveRequest as DirectFundObjectiveRequest,
} from '../protocols/directfund/directfund';

const log = debug('ts-nitro:client');

export class Client {
  // The core business logic of the client
  private engine?: Engine;

  address?: Address;

  private channelNotifier?: ChannelNotifier;

  private completedObjectivesForRPC?: ReadWriteChannel<ObjectiveId>;

  private completedObjectives?: SafeSyncMap<ReadWriteChannel<null>>;

  private failedObjectives?: ReadWriteChannel<ObjectiveId>;

  private receivedVouchers?: ReadWriteChannel<Voucher>;

  private chainId?: bigint;

  private store?: Store;

  private vm?: VoucherManager;

  private logger?: debug.Debugger;

  static async new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    logDestination: WritableStream | undefined,
    policymaker: PolicyMaker,
    metricsApi?: MetricsApi,
  ): Promise<Client> {
    const c = new Client();
    // TODO: Implement memstore.getAddress
    c.address = store.getAddress();

    // If a metrics API is not provided we used the no-op version which does nothing.
    if (!metricsApi) {
      // eslint-disable-next-line no-param-reassign
      metricsApi = new NoOpMetrics();
    }

    const chainId = await chainservice.getChainId();
    c.chainId = chainId;
    c.store = store;
    c.vm = VoucherManager.newVoucherManager(store.getAddress(), store);
    c.logger = log;

    c.engine = Engine.new(c.vm, messageService, chainservice, store, logDestination, policymaker, metricsApi);
    c.completedObjectives = new SafeSyncMap<ReadWriteChannel<null>>();
    c.completedObjectivesForRPC = Channel<ObjectiveId>(100);

    c.failedObjectives = Channel<ObjectiveId>(100);
    // Using a larger buffer since payments can be sent frequently.
    c.receivedVouchers = Channel<Voucher>(1000);

    c.channelNotifier = ChannelNotifier.newChannelNotifier(store, c.vm);
    // Start the engine in a go routine
    go(c.engine.run.bind(c.engine));

    // Start the event handler in a go routine
    // It will listen for events from the engine and dispatch events to client channels
    go(c.handleEngineEvents.bind(c));

    return c;
  }

  // CreateLedgerChannel creates a directly funded ledger channel with the given counterparty.
  // The channel will run under full consensus rules (it is not possible to provide a custom AppDefinition or AppData).
  // TODO: uint32 replacement
  createLedgerChannel(counterparty: Address, challengeDuration: number, outcome: Exit): DirectFundObjectiveResponse {
    assert(this.engine);
    assert(this.address);
    assert(this.chainId);

    const objectiveRequest = new DirectFundObjectiveRequest({
      counterParty: counterparty,
      challengeDuration,
      outcome,
      nonce: randUint64(),
      appDefinition: this.engine.getConsensusAppAddress(),
    });

    assert(this.engine.objectiveRequestsFromAPI);
    // Send the event to the engine
    this.engine.objectiveRequestsFromAPI.push(objectiveRequest);
    objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.response(this.address, this.chainId);
  }

  // handleEngineEvents is responsible for monitoring the ToApi channel on the engine.
  // It parses events from the ToApi chan and then dispatches events to the necessary client chan.
  // TODO: Implement
  private handleEngineEvents() {}
}
