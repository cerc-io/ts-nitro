import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';
import { WaitGroup } from '@jpwilliams/waitgroup';

import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import Channel from '@cerc-io/ts-channel';
import { go, randUint64, Context } from '@cerc-io/nitro-util';

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

const log = debug('ts-nitro:node');

export class Node {
  // The core business logic of the node
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

  private cancelEventHandler?: (reason ?: any) => void;

  private wg?: WaitGroup;

  static async new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    logDestination: WritableStream | undefined,
    policymaker: PolicyMaker,
    metricsApi?: MetricsApi,
  ): Promise<Node> {
    const n = new Node();
    n.address = store.getAddress();

    // If a metrics API is not provided we used the no-op version which does nothing.
    if (!metricsApi) {
      // eslint-disable-next-line no-param-reassign
      metricsApi = new NoOpMetrics();
    }

    const chainId = await chainservice.getChainId();
    n.chainId = chainId;
    n.store = store;
    n.vm = VoucherManager.newVoucherManager(store.getAddress(), store);
    n.logger = log;

    n.engine = Engine.new(n.vm, messageService, chainservice, store, logDestination, policymaker, metricsApi);
    n.completedObjectives = new SafeSyncMap<ReadWriteChannel<null>>();
    n.completedObjectivesForRPC = Channel<ObjectiveId>(100);

    n.failedObjectives = Channel<ObjectiveId>(100);
    // Using a larger buffer since payments can be sent frequently.
    n._receivedVouchers = Channel<Voucher>(1000);

    n.channelNotifier = ChannelNotifier.newChannelNotifier(store, n.vm);

    const ctx = new Context();
    n.cancelEventHandler = ctx.withCancel();

    n.wg = new WaitGroup();
    n.wg.add(1);
    // Start the event handler in a go routine
    // It will listen for events from the engine and dispatch events to node channels
    go(n.handleEngineEvents.bind(n), ctx);

    return n;
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

  // CreatePaymentChannel creates a virtual channel with the counterParty using ledger channels
  // with the supplied intermediaries.
  async createPaymentChannel(
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

  // ClosePaymentChannel attempts to close and defund the given virtually funded channel.
  async closePaymentChannel(channelId: Destination): Promise<ObjectiveId> {
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
  private async handleEngineEvents(ctx: Context) {
    /* eslint-disable no-await-in-loop */
    /* eslint-disable default-case */
    while (true) {
      switch (await Channel.select([
        ctx.done.shift(),
        this.engine.toApi.shift(),
      ])) {
        case ctx.done: {
          this.wg!.done();
          return;
        }

        case this.engine.toApi: {
          const update = this.engine.toApi.value();
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

          break;
        }
      }
    }
  }

  // ObjectiveCompleteChan returns a chan that is closed when the objective with given id is completed
  objectiveCompleteChan(id: ObjectiveId): ReadWriteChannel<null> {
    const [d] = this.completedObjectives!.loadOrStore(id, Channel<null>());
    return d;
  }

  // stopEventHandler stops the event handler goroutine and waits for it to quit successfully.
  async stopEventHandler(): Promise<void> {
    assert(this.cancelEventHandler);
    this.cancelEventHandler();
    await this.wg!.wait();
  }

  // Close stops the node from responding to any input.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async close(): Promise<void> {
    assert(this.channelNotifier);
    assert(this.engine);
    assert(this.store);
    assert(this.completedObjectivesForRPC);

    await this.stopEventHandler();
    this.channelNotifier.close();
    await this.engine.close();

    // At this point, the engine ToApi channel has been closed.
    // If there are blocking consumers (for or select channel statements) on any channel for which the node is a producer,
    // those channels need to be closed.
    this.completedObjectivesForRPC.close();

    await this.store.close();
  }

  // ReceivedVouchers returns a chan that receives a voucher every time we receive a payment voucher
  receivedVouchers(): ReadChannel<Voucher> {
    return this._receivedVouchers!;
  }

  // CreateVoucher creates and returns a voucher for the given channelId which increments the redeemable balance by amount.
  // It is the responsibility of the caller to send the voucher to the payee.
  async createVoucher(channelId: Destination, amount: bigint): Promise<Voucher> {
    assert(this.vm);
    assert(this.store);
    return this.vm.pay(channelId, amount, this.store.getChannelSigner());
  }

  // ReceiveVoucher receives a voucher and returns the amount that was paid.
  // It can be used to add a voucher that was sent outside of the go-nitro system.
  async receiveVoucher(v: Voucher): Promise<[bigint | undefined, bigint]> {
    assert(this.vm);
    return this.vm.receive(v);
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
        message: `${this.address}, error in nitro node`,
      });

      // We wait for a bit so the previous log line has time to complete
      await new Promise((resolve) => { setTimeout(() => resolve, 1000); });

      // TODO instead of a panic, errors should be returned to the caller.
      throw err;
    }
  }

  // Custom method to return the channel for vouchers being sent
  sentVouchers(): ReadChannel<Voucher> {
    return this.engine.sentVouchers;
  }
}
