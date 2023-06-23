/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import { Client, MemStore, Metrics } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
  ACTORS,
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
  let metricsAlice: Metrics;
  let metricsBob: Metrics;

  it('should instantiate Clients', async () => {
    assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

    const aliceStore = new MemStore(hex2Bytes(ACTORS.alice.privateKey));
    const aliceMsgService = await createP2PMessageService(process.env.RELAY_MULTIADDR, ALICE_MESSAGING_PORT, aliceStore.getAddress());

    [aliceClient, metricsAlice] = await setupClient(
      aliceMsgService,
      aliceStore,
      {
        chainPk: ACTORS.alice.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
      },
    );

    expect(aliceClient.address).to.equal(ACTORS.alice.address);

    const bobStore = new MemStore(hex2Bytes(ACTORS.bob.privateKey));
    const bobMsgService = await createP2PMessageService(process.env.RELAY_MULTIADDR, BOB_MESSAGING_PORT, bobStore.getAddress());

    [bobClient,metricsBob ] = await setupClient(
      bobMsgService,
      bobStore,
      {
        chainPk: ACTORS.bob.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
      },
    );

    expect(bobClient.address).to.equal(ACTORS.bob.address);

    await waitForPeerInfoExchange(1, [aliceMsgService, bobMsgService]);
    console.log({ metricsAlice: metricsAlice.getMetrics(), metricsBob: metricsBob.getMetrics() });
  });

  it('should create ledger channel', async () => {
    assert(aliceClient.address);

    const counterParty = ACTORS.bob.address;
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
    console.log({ metricsAlice: metricsAlice.getMetrics(), metricsBob: metricsBob.getMetrics() });

    // TODO: Implement and close services
    // client.close();
  });
});
