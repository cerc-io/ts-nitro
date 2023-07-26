import debug from 'debug';
import { Signer, Wallet, providers } from 'ethers';

// @ts-expect-error
import type { Peer } from '@cerc-io/peer';
import { NitroSigner } from '@cerc-io/nitro-util';

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
import { KeySigner } from './key-signer';

const log = debug('ts-nitro:util:nitro');

const CHALLENGE_DURATION = 0;
const ASSET = `0x${'00'.repeat(20)}`;

export class Nitro {
  client: Client;

  msgService: P2PMessageService;

  chainService: ChainService;

  constructor(
    client: Client,
    msgService: P2PMessageService,
    chainService: ChainService,
  ) {
    this.client = client;
    this.msgService = msgService;
    this.chainService = chainService;
  }

  static async setupClient(
    pk: string,
    chainURL: string,
    chainPk: string,
    contractAddresses: { [key: string]: string },
    peer: Peer,
    location?: string,
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
    );

    subscribeVoucherLogs(client);
    return new Nitro(client, msgService, chainService);
  }

  static async setupClientWithProvider(
    pk: string,
    provider: providers.JsonRpcProvider,
    contractAddresses: { [key: string]: string },
    peer: Peer,
    location?: string,
  ): Promise<Nitro> {
    // TODO: Create SnapSigner and use provider (with access to snap)
    const keySigner = new KeySigner(pk);
    const store = await this.getStore(keySigner, location);
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
    );

    subscribeVoucherLogs(client);
    return new Nitro(client, msgService, chainService);
  }

  private static getStore(signer: NitroSigner, location?: string): Promise<Store> {
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
      ASSET,
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

  async virtualFund(counterParty: string, amount: number): Promise<void> {
    const intermediaries: string[] = [];
    const outcome = createOutcome(
      ASSET,
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
}
