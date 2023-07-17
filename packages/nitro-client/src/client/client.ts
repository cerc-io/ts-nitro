import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';

import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import Channel from '@cerc-io/ts-channel';
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
import {
  Objective as DirectDefundObjective,
  ObjectiveRequest as DirectDefundObjectiveRequest,
} from '../protocols/directdefund/directdefund';
import {
  ObjectiveResponse as VirtualFundObjectiveResponse,
  ObjectiveRequest as VirtualFundObjectiveRequest,
} from '../protocols/virtualfund/virtualfund';
import {
  Objective as VirtualDefundObjective,
  ObjectiveRequest as VirtualDefundObjectiveRequest,
} from '../protocols/virtualdefund/virtualdefund';
import { Destination } from '../types/destination';
import { PaymentChannelInfo, LedgerChannelInfo } from './query/types';
import {
  getPaymentChannelInfo, getLedgerChannelInfo, getAllLedgerChannels, getPaymentChannelsByLedger,
} from './query/query';

const log = debug('ts-nitro:client');

export class Client {
  // The core business logic of the client
  private engine: Engine = new Engine();

  address: Address = ethers.constants.AddressZero;

  private channelNotifier?: ChannelNotifier;

  private completedObjectivesForRPC?: ReadWriteChannel<ObjectiveId>;

  private completedObjectives?: SafeSyncMap<ReadWriteChannel<null>>;

  private failedObjectives?: ReadWriteChannel<ObjectiveId>;

  private _receivedVouchers?: ReadWriteChannel<Voucher>;

  private chainId?: bigint;

  private store?: Store;

  private vm?: VoucherManager;

  private logger: debug.Debugger = log;

  static async new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    logDestination: WritableStream | undefined,
    policymaker: PolicyMaker,
    metricsApi?: MetricsApi,
  ): Promise<Client> {
    const c = new Client();
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
    c._receivedVouchers = Channel<Voucher>(1000);

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
  async createLedgerChannel(counterparty: Address, challengeDuration: number, outcome: Exit): Promise<DirectFundObjectiveResponse> {
    assert(this.engine);
    assert(this.address);
    assert(this.chainId);

    const objectiveRequest = DirectFundObjectiveRequest.newObjectiveRequest(
      ethers.utils.getAddress(counterparty),
      challengeDuration,
      outcome,
      randUint64(),
      this.engine.getConsensusAppAddress(),
    );

    assert(this.engine.objectiveRequestsFromAPI);
    // Send the event to the engine
    await this.engine.objectiveRequestsFromAPI.push(objectiveRequest);
    await objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.response(this.address, this.chainId);
  }

  // CloseLedgerChannel attempts to close and defund the given directly funded channel.
  async closeLedgerChannel(channelId: Destination): Promise<ObjectiveId> {
    const objectiveRequest = DirectDefundObjectiveRequest.newObjectiveRequest(channelId);

    assert(this.engine.objectiveRequestsFromAPI);
    // Send the event to the engine
    await this.engine.objectiveRequestsFromAPI.push(objectiveRequest);
    await objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.id(this.address, this.chainId);
  }

  // CreateVirtualChannel creates a virtual channel with the counterParty using ledger channels
  // with the supplied intermediaries.
  async createVirtualPaymentChannel(
    intermediaries: Address[],
    counterParty: Address,
    challengeDuration: number,
    outcome: Exit,
  ): Promise<VirtualFundObjectiveResponse> {
    assert(this.engine);

    const objectiveRequest = VirtualFundObjectiveRequest.newObjectiveRequest(
      intermediaries,
      ethers.utils.getAddress(counterParty),
      challengeDuration,
      outcome,
      randUint64(),
      this.engine.getVirtualPaymentAppAddress(),
    );

    // Send the event to the engine
    assert(this.engine.objectiveRequestsFromAPI);
    await this.engine.objectiveRequestsFromAPI.push(objectiveRequest);

    await objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.response(this.address);
  }

  // CloseVirtualChannel attempts to close and defund the given virtually funded channel.
  async closeVirtualChannel(channelId: Destination): Promise<ObjectiveId> {
    const objectiveRequest = VirtualDefundObjectiveRequest.newObjectiveRequest(channelId);

    // Send the event to the engine
    assert(this.engine.objectiveRequestsFromAPI);
    await this.engine.objectiveRequestsFromAPI.push(objectiveRequest);
    await objectiveRequest.waitForObjectiveToStart();
    return objectiveRequest.id(this.address, this.chainId);
  }

  // Pay will send a signed voucher to the payee that they can redeem for the given amount.
  async pay(channelId: Destination, amount?: bigint) {
    assert(this.engine.paymentRequestsFromAPI);
    // Send the event to the engine
    await this.engine.paymentRequestsFromAPI.push({ channelId, amount });
  }

  // GetPaymentChannel returns the payment channel with the given id.
  // If no ledger channel exists with the given id an error is returned.
  async getPaymentChannel(id: Destination): Promise<PaymentChannelInfo> {
    assert(this.store);
    assert(this.vm);
    return getPaymentChannelInfo(id, this.store, this.vm);
  }

  // handleEngineEvents is responsible for monitoring the ToApi channel on the engine.
  // It parses events from the ToApi chan and then dispatches events to the necessary client chan.
  private async handleEngineEvents() {
    /* eslint-disable no-await-in-loop */
    while (true) {
      const update = await this.engine.toApi.shift();
      if (update === undefined) {
        break;
      }

      for (const completed of update.completedObjectives) {
        const [d] = this.completedObjectives!.loadOrStore(String(completed.id()), Channel());
        d.close();

        // use a nonblocking send to the RPC Client in case no one is listening
        this.completedObjectivesForRPC!.push(completed.id());
      }

      for await (const erred of update.failedObjectives) {
        await this.failedObjectives!.push(erred);
      }

      for await (const payment of update.receivedVouchers) {
        await this._receivedVouchers!.push(payment);
      }

      for await (const updated of update.ledgerChannelUpdates) {
        try {
          // TODO: Implement
          this.channelNotifier!.notifyLedgerUpdated(updated);
        } catch (err) {
          await this.handleError(err as Error);
        }
      }

      for await (const updated of update.paymentChannelUpdates) {
        try {
          // TODO: Implement
          this.channelNotifier!.notifyPaymentUpdated(updated);
        } catch (err) {
          await this.handleError(err as Error);
        }
      }
    }

    // At this point, the engine ToApi channel has been closed.
    // If there are blocking consumers (for or select channel statements) on any channel for which the client is a producer,
    // those channels need to be closed.
    assert(this.completedObjectivesForRPC);
    this.completedObjectivesForRPC.close();
  }

  // ObjectiveCompleteChan returns a chan that is closed when the objective with given id is completed
  objectiveCompleteChan(id: ObjectiveId): ReadWriteChannel<null> {
    const [d] = this.completedObjectives!.loadOrStore(id, Channel<null>());
    return d;
  }

  // Close stops the client from responding to any input.
  // TODO: Implement (if required)
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async close(): Promise<void> {}

  // ReceivedVouchers returns a chan that receives a voucher every time we receive a payment voucher
  receivedVouchers(): ReadChannel<Voucher> {
    return this._receivedVouchers!;
  }

  // GetPaymentChannelsByLedger returns all active payment channels that are funded by the given ledger channel.
  getPaymentChannelsByLedger(ledgerId: Destination): Promise<PaymentChannelInfo[]> {
    assert(this.store);
    assert(this.vm);
    return getPaymentChannelsByLedger(ledgerId, this.store, this.vm);
  }

  // GetAllLedgerChannels returns all ledger channels.
  getAllLedgerChannels(): Promise<LedgerChannelInfo[]> {
    assert(this.store);
    return getAllLedgerChannels(this.store, this.engine.getConsensusAppAddress());
  }

  // GetLedgerChannel returns the ledger channel with the given id.
  // If no ledger channel exists with the given id an error is returned.
  async getLedgerChannel(id: Destination): Promise<LedgerChannelInfo> {
    assert(this.store);
    return getLedgerChannelInfo(id, this.store);
  }

  // handleError logs the error and panics
  // Eventually it should return the error to the caller
  async handleError(err: Error) {
    if (err) {
      this.logger({
        error: err,
        message: `${this.address}, error in API client`,
      });

      // We wait for a bit so the previous log line has time to complete
      await new Promise((resolve) => { setTimeout(() => resolve, 1000); });

      // TODO instead of a panic, errors should be returned to the caller.
      throw err;
    }
  }
}
