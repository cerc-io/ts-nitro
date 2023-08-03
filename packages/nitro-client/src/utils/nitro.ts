import debug from 'debug';
import { providers } from 'ethers';

// @ts-expect-error
import type { Peer } from '@cerc-io/peer';
import { NitroSigner, DEFAULT_ASSET } from '@cerc-io/nitro-util';

import { Client } from '../client/client';
import { P2PMessageService } from '../client/engine/messageservice/p2p-message-service/service';
import { Store } from '../client/engine/store/store';
import { MemStore } from '../client/engine/store/memstore';
import { DurableStore } from '../client/engine/store/durablestore';
import { Destination } from '../types/destination';
import { LedgerChannelInfo, PaymentChannelInfo } from '../client/query/types';
import { EthChainService } from '../client/engine/chainservice/eth-chainservice';

import { createOutcome, setupClient, subscribeVoucherLogs } from './helpers';
import { ChainService } from '../client/engine/chainservice/chainservice';
import { Voucher } from '../payments/vouchers';
import { KeySigner } from './signers/key-signer';
import { SnapSigner } from './signers/snap-signer';
import { MetricsApi } from '../client/engine/metrics';

const log = debug('ts-nitro:util:nitro');

const CHALLENGE_DURATION = 0;

export class Nitro {
  client: Client;

  msgService: P2PMessageService;

  chainService: ChainService;

  nitroSigner: NitroSigner;

  store: Store;

  asset: string;

  constructor(
    client: Client,
    msgService: P2PMessageService,
    chainService: ChainService,
    nitroSigner: NitroSigner,
    store: Store,
    asset?: string,
  ) {
    this.client = client;
    this.msgService = msgService;
    this.chainService = chainService;
    this.nitroSigner = nitroSigner;
    this.store = store;
    this.asset = asset ?? DEFAULT_ASSET;
  }

  static async setupClient(
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
    const store = await this.getStore(keySigner, location);
    const msgService = await P2PMessageService.newMessageService(store.getAddress(), peer);

    const chainService = await EthChainService.newEthChainService(
      chainURL,
      chainPk,
      contractAddresses.nitroAdjudicatorAddress,
      contractAddresses.consensusAppAddress,
      contractAddresses.virtualPaymentAppAddress,
    );

    const client = await setupClient(
      msgService,
      store,
      chainService,
      metricsApi,
    );

    subscribeVoucherLogs(client);
    return new Nitro(client, msgService, chainService, keySigner, store, asset);
  }

  static async setupClientWithProvider(
    provider: providers.Web3Provider,
    snapOrigin: string,
    contractAddresses: { [key: string]: string },
    peer: Peer,
    location?: string,
    metricsApi?: MetricsApi,
    asset?: string,
  ): Promise<Nitro> {
    const snapSigner = new SnapSigner(provider, snapOrigin);
    const store = await this.getStore(snapSigner, location);
    const msgService = await P2PMessageService.newMessageService(store.getAddress(), peer);

    const chainService = await EthChainService.newEthChainServiceWithProvider(
      provider,
      contractAddresses.nitroAdjudicatorAddress,
      contractAddresses.consensusAppAddress,
      contractAddresses.virtualPaymentAppAddress,
    );

    const client = await setupClient(
      msgService,
      store,
      chainService,
      metricsApi,
    );

    subscribeVoucherLogs(client);
    return new Nitro(client, msgService, chainService, snapSigner, store, asset);
  }

  private static async getStore(signer: NitroSigner, location?: string): Promise<Store> {
    await signer.init();

    if (location) {
      return DurableStore.newDurableStore(signer, location);
    }

    return MemStore.newMemStore(signer);
  }

  static async clearClientStorage(): Promise<boolean> {
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
      this.client.address,
      counterParty,
      amount,
    );

    const response = await this.client.createLedgerChannel(
      counterParty,
      CHALLENGE_DURATION,
      outcome,
    );

    await this.client.objectiveCompleteChan(response.id).shift();
    log(`Ledger channel created with id ${response.channelId.string()}\n`);

    return response.channelId.string();
  }

  async virtualFund(counterParty: string, amount: number): Promise<string> {
    const intermediaries: string[] = [];
    const outcome = createOutcome(
      this.asset,
      this.client.address,
      counterParty,
      amount,
    );

    const response = await this.client.createVirtualPaymentChannel(
      intermediaries,
      counterParty,
      CHALLENGE_DURATION,
      outcome,
    );

    await this.client.objectiveCompleteChan(response.id).shift();
    log(`Virtual payment channel created with id ${response.channelId.string()}\n`);
    return response.channelId.string();
  }

  async pay(virtualPaymentChannel: string, amount: number): Promise<Voucher> {
    const virtualPaymentChannelId = new Destination(virtualPaymentChannel);
    await this.client.pay(virtualPaymentChannelId, BigInt(amount));
    const sentVoucher = await this.client.sentVouchers().shift();

    return sentVoucher;
  }

  async virtualDefund(virtualPaymentChannel: string): Promise<void> {
    const virtualPaymentChannelId = new Destination(virtualPaymentChannel);
    const closeVirtualChannelObjectiveId = await this.client.closeVirtualChannel(virtualPaymentChannelId);

    await this.client.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();
    log(`Virtual payment channel with id ${virtualPaymentChannelId.string()} closed`);
  }

  async directDefund(ledgerChannel: string): Promise<void> {
    const ledgerChannelId: Destination = new Destination(ledgerChannel);
    const closeLedgerChannelObjectiveId = await this.client.closeLedgerChannel(ledgerChannelId);

    await this.client.objectiveCompleteChan(closeLedgerChannelObjectiveId).shift();
    log(`Ledger channel with id ${ledgerChannelId.string()} closed`);
  }

  async getLedgerChannel(ledgerChannel: string): Promise<LedgerChannelInfo> {
    const ledgerChannelId = new Destination(ledgerChannel);
    return this.client.getLedgerChannel(ledgerChannelId);
  }

  async getAllLedgerChannels(): Promise<LedgerChannelInfo[]> {
    return this.client.getAllLedgerChannels();
  }

  async getPaymentChannel(paymentChannel: string): Promise<PaymentChannelInfo> {
    const paymentChannelId = new Destination(paymentChannel);
    return this.client.getPaymentChannel(paymentChannelId);
  }

  async getPaymentChannelsByLedger(ledgerChannel: string): Promise<PaymentChannelInfo[]> {
    const ledgerChannelId = new Destination(ledgerChannel);
    return this.client.getPaymentChannelsByLedger(ledgerChannelId);
  }

  async close() {
    await this.store.close();
    await this.msgService.close();
    await this.client.close();
  }
}
