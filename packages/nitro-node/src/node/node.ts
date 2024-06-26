import debug from 'debug';
import assert from 'assert';
import { ethers } from 'ethers';

import type { ReadChannel, ReadWriteChannel } from '@cerc-io/ts-channel';
import Channel from '@cerc-io/ts-channel';
import {
  randUint64, WrappedError,
} from '@cerc-io/nitro-util';

import { MessageService } from './engine/messageservice/messageservice';
import { ChainService } from './engine/chainservice/chainservice';
import { Store } from './engine/store/store';
import { PolicyMaker } from './engine/policy-maker';
import { VoucherManager } from '../payments/voucher-manager';
import { Engine, EngineEvent } from './engine/engine';
import { Address } from '../types/types';
import { ChannelNotifier } from './notifier/channel-notifier';
import { ObjectiveId } from '../protocols/messages';
import { SafeSyncMap } from '../internal/safesync/safesync';
import { Voucher, ReceiveVoucherSummary } from '../payments/vouchers';
import { MetricsApi } from './engine/metrics';
import { Exit } from '../channel/state/outcome/exit';
import {
  ObjectiveResponse as DirectFundObjectiveResponse,
  ObjectiveRequest as DirectFundObjectiveRequest,
  channelsExistWithCounterparty,
  ErrLedgerChannelExists,
} from '../protocols/directfund/directfund';
import {
  ObjectiveRequest as DirectDefundObjectiveRequest,
} from '../protocols/directdefund/directdefund';
import {
  ObjectiveResponse as VirtualFundObjectiveResponse,
  ObjectiveRequest as VirtualFundObjectiveRequest,
} from '../protocols/virtualfund/virtualfund';
import {
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

  static async new(
    messageService: MessageService,
    chainservice: ChainService,
    store: Store,
    policymaker: PolicyMaker,
    metricsApi?: MetricsApi,
  ): Promise<Node> {
    const n = new Node();
    n.address = store.getAddress();

    const chainId = await chainservice.getChainId();
    n.chainId = chainId;
    n.store = store;
    n.vm = VoucherManager.newVoucherManager(store.getAddress(), store);

    n.engine = Engine.new(n.vm, messageService, chainservice, store, policymaker, n.handleEngineEvents.bind(n), metricsApi);
    n.completedObjectives = new SafeSyncMap<ReadWriteChannel<null>>();
    n.completedObjectivesForRPC = Channel<ObjectiveId>(100);

    n.failedObjectives = Channel<ObjectiveId>(100);
    // Using a larger buffer since payments can be sent frequently.
    n._receivedVouchers = Channel<Voucher>(1000);

    n.channelNotifier = ChannelNotifier.newChannelNotifier(store, n.vm);

    return n;
  }

  // CreateLedgerChannel creates a directly funded ledger channel with the given counterparty.
  // The channel will run under full consensus rules (it is not possible to provide a custom AppDefinition or AppData).
  async createLedgerChannel(counterparty: Address, challengeDuration: number, outcome: Exit): Promise<DirectFundObjectiveResponse> {
    assert(this.chainId);

    const objectiveRequest = DirectFundObjectiveRequest.newObjectiveRequest(
      ethers.utils.getAddress(counterparty),
      challengeDuration,
      outcome,
      randUint64(),
      this.engine.getConsensusAppAddress(),
    );

    assert(this.store);
    // Check store to see if there is an existing channel with this counterparty
    let channelExists: boolean;
    try {
      channelExists = await channelsExistWithCounterparty(
        ethers.utils.getAddress(counterparty),
        this.store.getChannelsByParticipant.bind(this.store),
        this.store.getConsensusChannel.bind(this.store),
      );
    } catch (err) {
      log(JSON.stringify({
        message: 'direct fund error',
        error: err,
      }));
      throw new WrappedError('counterparty check failed', err as Error);
    }

    if (channelExists) {
      log(JSON.stringify({
        message: 'directfund: channel already exists',
        error: ErrLedgerChannelExists,
      }));
      throw new WrappedError(
        `counterparty ${ethers.utils.getAddress(counterparty)}`,
        ErrLedgerChannelExists,
      );
    }

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

  // handleEngineEvents dispatches events to the necessary node chan.
  private async handleEngineEvents(update: EngineEvent) {
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
        this.channelNotifier!.notifyLedgerUpdated(updated);
      } catch (err) {
        await this.handleError(err as Error);
      }
    }

    for await (const updated of update.paymentChannelUpdates) {
      try {
        this.channelNotifier!.notifyPaymentUpdated(updated);
      } catch (err) {
        await this.handleError(err as Error);
      }
    }
  }

  // ObjectiveCompleteChan returns a chan that is closed when the objective with given id is completed
  objectiveCompleteChan(id: ObjectiveId): ReadWriteChannel<null> {
    const [d] = this.completedObjectives!.loadOrStore(id, Channel<null>());
    return d;
  }

  // Close stops the node from responding to any input.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async close(): Promise<void> {
    assert(this.channelNotifier);
    assert(this.store);
    assert(this.completedObjectivesForRPC);

    await this.engine.close();
    await this.channelNotifier.close();

    // If there are blocking consumers (for or select channel statements) on any channel for which the node is a producer,
    // those channels need to be closed.
    this.completedObjectivesForRPC.close();

    await this.store.close();
  }

  // ReceivedVouchers returns a chan that receives a voucher every time we receive a payment voucher
  receivedVouchers(): ReadChannel<Voucher> {
    // TODO: Register listeners and send voucher to each instead
    return this._receivedVouchers!.readOnly();
  }

  // CreateVoucher creates and returns a voucher for the given channelId which increments the redeemable balance by amount.
  // It is the responsibility of the caller to send the voucher to the payee.
  async createVoucher(channelId: Destination, amount: bigint): Promise<Voucher> {
    assert(this.vm);
    assert(this.store);
    assert(this.channelNotifier);
    const voucher = this.vm.pay(channelId, amount, this.store.getChannelSigner());

    const info = await this.getPaymentChannel(channelId);

    this.channelNotifier.notifyPaymentUpdated(info);

    return voucher;
  }

  // ReceiveVoucher receives a voucher and returns the amount that was paid.
  // It can be used to add a voucher that was sent outside of the go-nitro system.
  async receiveVoucher(v: Voucher): Promise<ReceiveVoucherSummary> {
    assert(this.vm);
    const [total, delta] = await this.vm.receive(v);
    return { total, delta };
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

  // GetLastBlockNum returns last confirmed blockNum read from store
  getLastBlockNum(): bigint | Promise<bigint> {
    assert(this.store);
    return this.store.getLastBlockNumSeen();
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
      log(JSON.stringify({
        message: 'Error in nitro node',
        error: err,
      }));

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

  // LedgerUpdates returns a chan that receives ledger channel info whenever that ledger channel is updated. Not suitable for multiple subscribers.
  ledgerUpdates() {
    return this.channelNotifier!.registerForAllLedgerUpdates();
  }

  // PaymentUpdates returns a chan that receives payment channel info whenever that payment channel is updated. Not suitable fo multiple subscribers.
  paymentUpdates() {
    return this.channelNotifier!.registerForAllPaymentUpdates();
  }

  // LedgerUpdatedChan returns a chan that receives a ledger channel info whenever the ledger with given id is updated
  ledgerUpdatedChan(ledgerId: Destination) {
    return this.channelNotifier!.registerForLedgerUpdates(ledgerId);
  }

  // PaymentChannelUpdatedChan returns a chan that receives a payment channel info whenever the payment channel with given id is updated
  paymentChannelUpdatedChan(ledgerId: Destination) {
    return this.channelNotifier!.registerForPaymentChannelUpdates(ledgerId);
  }
}
