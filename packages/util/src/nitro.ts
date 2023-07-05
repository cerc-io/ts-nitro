import debug from 'debug';

import {
  Client, Destination, DurableStore, MemStore, P2PMessageService, Store,
} from '@cerc-io/nitro-client';
import { JSONbigNative, hex2Bytes } from '@cerc-io/nitro-util';

import { createOutcome, setupClient, subscribeVoucherLogs } from './helpers';

const log = debug('ts-nitro:util:nitro');

const CHALLENGE_DURATION = 0;
const ASSET = `0x${'00'.repeat(20)}`;

export class Nitro {
  client: Client;

  msgService: P2PMessageService;

  constructor(
    client: Client,
    msgService: P2PMessageService,
  ) {
    this.client = client;
    this.msgService = msgService;
  }

  static async setupClient(
    pk: string,
    chainURL: string,
    chainPk: string,
    relayMultiaddr: string,
    location?: string,
  ): Promise<Nitro> {
    let store: Store;
    if (location) {
      store = DurableStore.newDurableStore(hex2Bytes(pk), location);
    } else {
      store = new MemStore(hex2Bytes(pk));
    }

    // Type error thrown in NodeJS build
    // TODO: Move file to separate package which is only used for browser build
    const msgService = await (P2PMessageService as any).newMessageService(relayMultiaddr, store.getAddress(), hex2Bytes(pk));

    const client = await setupClient(
      msgService,
      store,
      {
        chainPk,
        chainURL,
      },
    );

    subscribeVoucherLogs(client);
    return new Nitro(client, msgService);
  }

  static async clearClientStorage(): Promise<void> {
    // Delete all databases in browser
    const dbs = await window.indexedDB.databases();
    dbs.forEach((db) => window.indexedDB.deleteDatabase(db.name!));
  }

  // TODO: Implement close method

  async addPeerByMultiaddr(address: string, multiaddrString: string): Promise<void> {
    const { multiaddr } = await import('@multiformats/multiaddr');
    const multi = multiaddr(multiaddrString);
    await this.msgService.addPeerByMultiaddr(address, multi);
  }

  async directFund(counterParty: string, amount: number): Promise<void> {
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

  async pay(virtualPaymentChannel: string, amount: number): Promise<void> {
    const virtualPaymentChannelId = new Destination(virtualPaymentChannel);
    await this.client.pay(virtualPaymentChannelId, BigInt(amount));

    // TODO: Wait for the payment to be processed
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

  async getLedgerChannel(ledgerChannel: string): Promise<void> {
    const ledgerChannelId = new Destination(ledgerChannel);
    const ledgerChannelStatus = await this.client.getLedgerChannel(ledgerChannelId);

    log(
      `Ledger channel ${ledgerChannelId.string()} status:\n`,
      JSONbigNative.stringify(ledgerChannelStatus, null, 2),
    );
  }

  async getPaymentChannel(paymentChannel: string): Promise<void> {
    const paymentChannelId = new Destination(paymentChannel);
    const paymentChannelStatus = await this.client.getLedgerChannel(paymentChannelId);

    log(
      `Virtual payment channel ${paymentChannelId.string()} status:\n`,
      JSONbigNative.stringify(paymentChannelStatus, null, 2),
    );
  }
}
