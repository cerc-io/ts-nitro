/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import { Client, MemStore } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
  ALICE_ADDRESS,
  ALICE_PK,
  ALICE_CHAIN_PK,
  BOB_ADDRESS,
  BOB_PK,
  BOB_CHAIN_PK,
} from '@cerc-io/util';

import { DirectFundParams } from '../src/types';
import {
  ALICE_MESSAGING_PORT,
  BOB_MESSAGING_PORT,
} from './constants';
import { createP2PMessageService, waitForPeerInfoExchange } from '../src/utils';

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;

  it('should instantiate Clients', async () => {
    const relayMultiaddr = process.env.RELAY_MULTIADDR;
    assert(relayMultiaddr, 'RELAY_MULTIADDR should be set in .env');

    const aliceStore = new MemStore(hex2Bytes(ALICE_PK));
    const aliceMsgService = await createP2PMessageService(relayMultiaddr, ALICE_MESSAGING_PORT, aliceStore.getAddress());

    aliceClient = await setupClient(
      aliceMsgService,
      aliceStore,
      {
        chainPk: ALICE_CHAIN_PK,
        chainURL: DEFAULT_CHAIN_URL,
      },
    );

    expect(aliceClient.address).to.equal(ALICE_ADDRESS);

    const bobStore = new MemStore(hex2Bytes(BOB_PK));
    const bobMsgService = await createP2PMessageService(relayMultiaddr, BOB_MESSAGING_PORT, bobStore.getAddress());

    bobClient = await setupClient(
      bobMsgService,
      bobStore,
      {
        chainPk: BOB_CHAIN_PK,
        chainURL: DEFAULT_CHAIN_URL,
      },
    );

    expect(bobClient.address).to.equal(BOB_ADDRESS);

    await waitForPeerInfoExchange(1, [aliceMsgService, bobMsgService]);
  });

  it('should create ledger channel', async () => {
    assert(aliceClient.address);

    const counterParty = BOB_ADDRESS;
    const asset = `0x${'00'.repeat(20)}`;
    const params: DirectFundParams = {
      counterParty,
      challengeDuration: 0,
      outcome: createOutcome(
        asset,
        aliceClient.address,
        counterParty,
        1_000_000,
      ),
      appDefinition: asset,
      appData: '0x00',
      nonce: Date.now(),
    };

    const response = await aliceClient.createLedgerChannel(
      params.counterParty,
      params.challengeDuration,
      params.outcome,
    );

    expect(response).to.have.property('id');
    expect(response).to.have.property('channelId');

    // Check that channelId value is present as a substring in id
    expect(response.id).to.contain(response.channelId.value);

    // TODO: Implement and close services
    // client.close();
  });
});
