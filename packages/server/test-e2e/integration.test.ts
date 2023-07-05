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
  METRICS_KEYS_CLIENT_INSTANTIATION,
  METRICS_MESSAGE_KEYS_VALUES,
  METRICS_KEYS_DIRECT_FUND,
  METRICS_KEYS_FUNCTIONS,
} from './constants';
import { createP2PMessageService, waitForPeerInfoExchange } from '../src/utils';
import { getMetricsKey, getMetricsMessageObj, getMetricsMessage } from './utils';

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;
  let aliceMetrics: Metrics;
  let bobMetrics: Metrics;

  it('should instantiate Clients', async () => {
    assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

    const aliceStore = new MemStore(hex2Bytes(ACTORS.alice.privateKey));
    const aliceMsgService = await createP2PMessageService(process.env.RELAY_MULTIADDR, ALICE_MESSAGING_PORT, aliceStore.getAddress());
    aliceMetrics = new Metrics();

    aliceClient = await setupClient(
      aliceMsgService,
      aliceStore,
      {
        chainPk: ACTORS.alice.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
      },
      aliceMetrics,
    );

    expect(aliceClient.address).to.equal(ACTORS.alice.address);

    const bobStore = new MemStore(hex2Bytes(ACTORS.bob.privateKey));
    const bobMsgService = await createP2PMessageService(process.env.RELAY_MULTIADDR, BOB_MESSAGING_PORT, bobStore.getAddress());
    bobMetrics = new Metrics();

    bobClient = await setupClient(
      bobMsgService,
      bobStore,
      {
        chainPk: ACTORS.bob.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
      },
      bobMetrics,
    );

    expect(bobClient.address).to.equal(ACTORS.bob.address);

    await waitForPeerInfoExchange(1, [aliceMsgService, bobMsgService]);

    expect(aliceMetrics.getMetrics()).to.includes.keys(...getMetricsKey(METRICS_KEYS_CLIENT_INSTANTIATION, ACTORS.alice.address));
    expect(bobMetrics.getMetrics()).to.includes.keys(...getMetricsKey(METRICS_KEYS_CLIENT_INSTANTIATION, ACTORS.bob.address));
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

    await aliceClient.objectiveCompleteChan(response.id).shift();

    expect(response).to.have.property('id');
    expect(response).to.have.property('channelId');

    // Check that channelId value is present as a substring in id
    expect(response.id).to.contain(response.channelId.value);

    expect(aliceMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_payload_size', ACTORS.alice.address, ACTORS.bob.address));
    expect(bobMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_payload_size', ACTORS.bob.address, ACTORS.alice.address));

    expect(aliceMetrics.getMetrics()).to.include(getMetricsMessageObj(METRICS_MESSAGE_KEYS_VALUES, ACTORS.alice.address, ACTORS.bob.address));
    expect(bobMetrics.getMetrics()).to.include(getMetricsMessageObj(METRICS_MESSAGE_KEYS_VALUES, ACTORS.bob.address, ACTORS.alice.address));

    expect(aliceMetrics.getMetrics()).to.include.keys(...getMetricsKey(METRICS_KEYS_DIRECT_FUND, ACTORS.alice.address));

    getMetricsKey(METRICS_KEYS_FUNCTIONS, ACTORS.alice.address).forEach((key) => {
      expect(aliceMetrics.getMetrics()[key]).to.be.above(0);
    });

    getMetricsKey(METRICS_KEYS_FUNCTIONS, ACTORS.bob.address).forEach((key) => {
      expect(bobMetrics.getMetrics()[key]).to.be.above(0);
    });

    expect(aliceMetrics.getMetrics()[getMetricsKey(['handleObjectiveRequest'], ACTORS.alice.address)[0]]).to.be.above(0);
    expect(bobMetrics.getMetrics()[getMetricsKey(['constructObjectiveFromMessage'], ACTORS.bob.address)[0]]).to.be.above(0);

    // TODO: Implement and close services
    // client.close();
  });
});
