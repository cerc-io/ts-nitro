import debug from 'debug';

import {
  Client, DurableStore, MemStore, P2PMessageService, Store,
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { createOutcome, setupClient } from './helpers';

const log = debug('ts-nitro:util:nitro');

const CHALLENGE_DURATION = 0;
const ASSET = `0x${'00'.repeat(20)}`;

const createP2PMessageService = async (relayMultiAddr: string, me: string): Promise<P2PMessageService> => {
  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  // Type error thrown in NodeJS build
  // TODO: Move file to separate package which is only used for browser build
  return (P2PMessageService as any).newMessageService(
    relayMultiAddr,
    me,
    privateKey.bytes,
  );
};

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

    const msgService = await createP2PMessageService(relayMultiaddr, store.getAddress());

    const client = await setupClient(
      msgService,
      store,
      {
        chainPk,
        chainURL,
      },
    );

    return new Nitro(client, msgService);
  }

  static async clearClientStorage(): Promise<void> {
    // Delete all databases in browser
    const dbs = await window.indexedDB.databases();
    dbs.forEach((db) => window.indexedDB.deleteDatabase(db.name!));
  }

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
}
