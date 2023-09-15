import debug from 'debug';
import { providers } from 'ethers';

// @ts-expect-error
import type { Peer } from '@cerc-io/peer';
import { NitroSigner, DEFAULT_ASSET } from '@cerc-io/nitro-util';

import { Node } from '../node/node';
import { P2PMessageService } from '../node/engine/messageservice/p2p-message-service/service';
import { Store } from '../node/engine/store/store';
import { newStore } from '../node/engine/store/utils';
import { Destination } from '../types/destination';
import { LedgerChannelInfo, PaymentChannelInfo } from '../node/query/types';
import { EthChainService } from '../node/engine/chainservice/eth-chainservice';

import { createOutcome, setupNode, subscribeVoucherLogs } from './helpers';
import { ChainService } from '../node/engine/chainservice/chainservice';
import { Voucher } from '../payments/vouchers';
import { KeySigner } from './signers/key-signer';
import { SnapSigner } from './signers/snap-signer';
import { MetricsApi } from '../node/engine/metrics';

const log = debug('ts-nitro:util:nitro');

const CHALLENGE_DURATION = 0;

export class Nitro {
  node: Node;

  msgService: P2PMessageService;

  chainService: ChainService;

  nitroSigner: NitroSigner;

  store: Store;

  asset: string;

  constructor(
    node: Node,
    msgService: P2PMessageService,
    chainService: ChainService,
    nitroSigner: NitroSigner,
    store: Store,
    asset?: string,
  ) {
    this.node = node;
    this.msgService = msgService;
    this.chainService = chainService;
    this.nitroSigner = nitroSigner;
    this.store = store;
    this.asset = (asset === undefined || asset === '') ? DEFAULT_ASSET : asset;
  }

  static async setupNode(
    pk: string,
    chainURL: string,
    chainPk: string,
    contractAddresses: { [key: string]: string },
    peer: Peer,
    location?: string,
    metricsApi?: MetricsApi,
    asset?: string,
  ): Promise<Nitro> {
    const keySigner = new KeySigner(pk);
    const store = await newStore(keySigner, location);
    const msgService = await P2PMessageService.newMessageService(store.getAddress(), peer);

    const chainService = await EthChainService.newEthChainService(
      chainURL,
      chainPk,
      contractAddresses.nitroAdjudicatorAddress,
      contractAddresses.consensusAppAddress,
      contractAddresses.virtualPaymentAppAddress,
    );

    const node = await setupNode(
      msgService,
      store,
      chainService,
      metricsApi,
    );

    return new Nitro(node, msgService, chainService, keySigner, store);
  }

  static async setupNodeWithProvider(
    provider: providers.Web3Provider,
    snapOrigin: string,
    contractAddresses: { [key: string]: string },
    peer: Peer,
    location?: string,
    metricsApi?: MetricsApi,
    asset?: string,
  ): Promise<Nitro> {
    const snapSigner = new SnapSigner(provider, snapOrigin);
    const store = await newStore(snapSigner, location);
    const msgService = await P2PMessageService.newMessageService(store.getAddress(), peer);

    const chainService = await EthChainService.newEthChainServiceWithProvider(
      provider,
      contractAddresses.nitroAdjudicatorAddress,
      contractAddresses.consensusAppAddress,
      contractAddresses.virtualPaymentAppAddress,
    );

    const node = await setupNode(
      msgService,
      store,
      chainService,
      metricsApi,
    );

    return new Nitro(node, msgService, chainService, snapSigner, store);
  }

  static async clearNodeStorage(): Promise<boolean> {
    // Delete all databases in browser
    const dbs = await window.indexedDB.databases();
    dbs.forEach((db) => window.indexedDB.deleteDatabase(db.name!));
    return true;
  }

  async addPeerByMultiaddr(address: string, multiaddrString: string): Promise<void> {
    await this.msgService.addPeerByMultiaddr(address, multiaddrString);
  }

  async isPeerDialable(address: string): Promise<[boolean, string]> {
    const [dialable, errString] = await this.msgService.isPeerDialable(address);

    if (!dialable) {
      return [false, `Not able to dial peer with address ${address}: ${errString}`];
    }

    return [true, `Peer with address ${address} is dialable`];
  }

  async directFund(counterParty: string, amount: number): Promise<string> {
    const outcome = createOutcome(
      this.asset,
      this.node.address,
      counterParty,
      amount,
    );

    const response = await this.node.createLedgerChannel(
      counterParty,
      CHALLENGE_DURATION,
      outcome,
    );

    await this.node.objectiveCompleteChan(response.id).shift();
    log(`Ledger channel created with id ${response.channelId.string()}\n`);

    return response.channelId.string();
  }

  async virtualFund(counterParty: string, amount: number, intermediaries: string[] = []): Promise<string> {
    const outcome = createOutcome(
      this.asset,
      this.node.address,
      counterParty,
      amount,
    );

    const response = await this.node.createPaymentChannel(
      intermediaries,
      counterParty,
      CHALLENGE_DURATION,
      outcome,
    );

    await this.node.objectiveCompleteChan(response.id).shift();
    log(`Virtual payment channel created with id ${response.channelId.string()}\n`);
    return response.channelId.string();
  }

  async pay(virtualPaymentChannel: string, amount: number): Promise<Voucher> {
    const virtualPaymentChannelId = new Destination(virtualPaymentChannel);
    await this.node.pay(virtualPaymentChannelId, BigInt(amount));
    const sentVoucher = await this.node.sentVouchers().shift();

    return sentVoucher;
  }

  async virtualDefund(virtualPaymentChannel: string): Promise<void> {
    const virtualPaymentChannelId = new Destination(virtualPaymentChannel);
    const closeVirtualChannelObjectiveId = await this.node.closePaymentChannel(virtualPaymentChannelId);

    await this.node.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();
    log(`Virtual payment channel with id ${virtualPaymentChannelId.string()} closed`);
  }

  async directDefund(ledgerChannel: string): Promise<void> {
    const ledgerChannelId: Destination = new Destination(ledgerChannel);
    const closeLedgerChannelObjectiveId = await this.node.closeLedgerChannel(ledgerChannelId);

    await this.node.objectiveCompleteChan(closeLedgerChannelObjectiveId).shift();
    log(`Ledger channel with id ${ledgerChannelId.string()} closed`);
  }

  async getLedgerChannel(ledgerChannel: string): Promise<LedgerChannelInfo> {
    const ledgerChannelId = new Destination(ledgerChannel);
    return this.node.getLedgerChannel(ledgerChannelId);
  }

  async getAllLedgerChannels(): Promise<LedgerChannelInfo[]> {
    return this.node.getAllLedgerChannels();
  }

  async getPaymentChannel(paymentChannel: string): Promise<PaymentChannelInfo> {
    const paymentChannelId = new Destination(paymentChannel);
    return this.node.getPaymentChannel(paymentChannelId);
  }

  async getPaymentChannelsByLedger(ledgerChannel: string): Promise<PaymentChannelInfo[]> {
    const ledgerChannelId = new Destination(ledgerChannel);
    return this.node.getPaymentChannelsByLedger(ledgerChannelId);
  }

  async close() {
    await this.store.close();
    await this.msgService.close();
    await this.node.close();
  }
}
