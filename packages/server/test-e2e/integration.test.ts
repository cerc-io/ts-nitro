/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import {
  Client, MemStore, Metrics, P2PMessageService, utils,
} from '@cerc-io/nitro-client';
import { hex2Bytes, DEFAULT_CHAIN_URL } from '@cerc-io/nitro-util';

import { DirectFundParams } from '../src/types';
import {
  METRICS_KEYS_CLIENT_INSTANTIATION,
  METRICS_MESSAGE_KEYS_VALUES,
  METRICS_KEYS_DIRECT_FUND,
  METRICS_KEYS_FUNCTIONS,
} from './constants';
import { waitForPeerInfoExchange } from '../src/utils';
import { getMetricsKey, getMetricsMessageObj, getMetricsMessage } from './utils';
import contractAddresses from '../src/nitro-addresses.json';

const {
  setupClient,
  createOutcome,
  ACTORS,
  createPeerIdFromKey,
  createPeerAndInit,
} = utils;

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;
  let aliceMetrics: Metrics;
  let bobMetrics: Metrics;

  it('should instantiate Clients', async () => {
    assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

    const aliceStore = new MemStore(hex2Bytes(ACTORS.alice.privateKey));
    const alicePeerIdObj = await createPeerIdFromKey(hex2Bytes(ACTORS.alice.privateKey));
    const alicePeer = await createPeerAndInit(process.env.RELAY_MULTIADDR, {}, alicePeerIdObj);
    const aliceMsgService = await P2PMessageService.newMessageService(
      aliceStore.getAddress(),
      alicePeer,
    );
    aliceMetrics = new Metrics();

    aliceClient = await setupClient(
      aliceMsgService,
      aliceStore,
      {
        chainPk: ACTORS.alice.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
        contractAddresses,
      },
      aliceMetrics,
    );

    expect(aliceClient.address).to.equal(ACTORS.alice.address);

    const bobStore = new MemStore(hex2Bytes(ACTORS.bob.privateKey));
    const bobPeerIdObj = await createPeerIdFromKey(hex2Bytes(ACTORS.bob.privateKey));
    const bobPeer = await createPeerAndInit(process.env.RELAY_MULTIADDR, {}, bobPeerIdObj);
    const bobMsgService = await P2PMessageService.newMessageService(
      bobStore.getAddress(),
      bobPeer,
    );
    bobMetrics = new Metrics();

    bobClient = await setupClient(
      bobMsgService,
      bobStore,
      {
        chainPk: ACTORS.bob.chainPrivateKey,
        chainURL: DEFAULT_CHAIN_URL,
        contractAddresses,
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
