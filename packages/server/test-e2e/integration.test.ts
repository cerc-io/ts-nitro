/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import {
  Client, MemStore, Metrics, P2PMessageService, utils, Destination, LedgerChannelInfo,
  ChannelStatus, LedgerChannelBalance, PaymentChannelInfo, PaymentChannelBalance,
} from '@cerc-io/nitro-client';
import {
  hex2Bytes, DEFAULT_CHAIN_URL, getBalanceByKey, getBalanceByAddress,
} from '@cerc-io/nitro-util';

import {
  DirectFundParams,
  VirtualFundParams,
} from '../src/types';
import {
  METRICS_KEYS_CLIENT_INSTANTIATION,
  METRICS_MESSAGE_KEYS_VALUES,
  METRICS_KEYS_DIRECT_FUND,
  METRICS_KEYS_FUNCTIONS,
} from './constants';
import { waitForPeerInfoExchange } from '../src/utils';
import {
  getMetricsKey, getMetricsMessageObj, getMetricsMessage,
} from './utils';
import contractAddresses from '../src/nitro-addresses.json';

const {
  setupClient,
  createOutcome,
  ACTORS,
  createPeerIdFromKey,
  createPeerAndInit,
} = utils;

const ALICE_BALANCE_AFTER_DIRECTFUND = '0';
const BOB_BALANCE_AFTER_DIRECTFUND = '0';
const ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND = '9999990425995322269314';
const BOB_CHAIN_BALANCE_AFTER_DIRECTFUND = '9999999938424127028256';
const ALICE_BALANCE_AFTER_DIRECTDEFUND = '999850';
const BOB_BALANCE_AFTER_DIRECTDEFUND = '1000150';
const BOB_CHAIN_BALANCE_AFTER_DIRECTDEFUND = '9999999938424127028256';

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;
  let aliceMetrics: Metrics;
  let bobMetrics: Metrics;
  let ledgerChannelId: Destination;
  let paymentChannelId: Destination;
  const asset = `0x${'00'.repeat(20)}`;

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
    const amount = 1_000_000;
    const params: DirectFundParams = {
      counterParty,
      challengeDuration: 0,
      outcome: createOutcome(
        asset,
        aliceClient.address,
        counterParty,
        amount,
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

    ledgerChannelId = response.channelId;
    await aliceClient.objectiveCompleteChan(response.id).shift();

    expect(response).to.have.property('id');
    expect(response).to.have.property('channelId');

    // Check that channelId value is present as a substring in id
    expect(response.id).to.contain(response.channelId.value);

    expect(aliceMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_payload_size', ACTORS.alice.address, ACTORS.bob.address));
    expect(bobMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_payload_size', ACTORS.bob.address, ACTORS.alice.address));

    expect(aliceMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_size', ACTORS.alice.address, ACTORS.bob.address));
    expect(bobMetrics.getMetrics()).to.have.property(getMetricsMessage('msg_size', ACTORS.bob.address, ACTORS.alice.address));

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

    const ledgerChannelStatus = await aliceClient.getLedgerChannel(ledgerChannelId);
    const expectedLedgerChannelStatus = new LedgerChannelInfo({
      iD: ledgerChannelId,
      status: ChannelStatus.Open,
      balance: new LedgerChannelBalance({
        assetAddress: asset,
        hub: ACTORS.bob.address,
        client: ACTORS.alice.address,
        hubBalance: BigInt(amount),
        clientBalance: BigInt(amount),
      }),
    });
    expect(ledgerChannelStatus).to.deep.equal(expectedLedgerChannelStatus);

    const aliceBalance = await getBalanceByAddress(ACTORS.alice.address, DEFAULT_CHAIN_URL);
    expect(aliceBalance.toString()).to.be.equal(ALICE_BALANCE_AFTER_DIRECTFUND);

    const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(aliceChainBalance.toString()).to.be.equal(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND);

    const bobBalance = await getBalanceByAddress(ACTORS.bob.address, DEFAULT_CHAIN_URL);
    expect(bobBalance.toString()).to.be.equal(BOB_BALANCE_AFTER_DIRECTFUND);

    const bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(bobChainBalance.toString()).to.be.equal(BOB_CHAIN_BALANCE_AFTER_DIRECTFUND);

    // TODO: Implement and close services
    // client.close();
  });

  it('should create virtual channel', async () => {
    const amount = 1_000_000;
    const counterParty = ACTORS.bob.address;

    const params: VirtualFundParams = {
      intermediaries: [],
      counterParty,
      challengeDuration: 0,
      outcome: createOutcome(
        asset,
        aliceClient.address,
        counterParty,
        amount,
      ),
      nonce: Date.now(),
      appDefinition: asset,
    };
    const response = await aliceClient.createVirtualPaymentChannel(
      params.intermediaries,
      params.counterParty,
      params.challengeDuration,
      params.outcome,
    );
    paymentChannelId = response.channelId;

    await aliceClient.objectiveCompleteChan(response.id).shift();

    const paymentChannelStatus = await aliceClient.getPaymentChannel(paymentChannelId);
    const expectedPaymentChannelStatus = new PaymentChannelInfo({
      iD: paymentChannelId,
      status: ChannelStatus.Open,
      balance: new PaymentChannelBalance({
        assetAddress: asset,
        payee: ACTORS.bob.address,
        payer: ACTORS.alice.address,
        paidSoFar: BigInt(0),
        remainingFunds: BigInt(amount),
      }),
    });
    expect(paymentChannelStatus).to.deep.equal(expectedPaymentChannelStatus);

    const aliceBalance = await getBalanceByAddress(ACTORS.alice.address, DEFAULT_CHAIN_URL);
    expect(aliceBalance.toString()).to.be.equal(ALICE_BALANCE_AFTER_DIRECTFUND);

    const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(aliceChainBalance.toString()).to.be.equal(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND);

    const bobBalance = await getBalanceByAddress(ACTORS.bob.address, DEFAULT_CHAIN_URL);
    expect(bobBalance.toString()).to.be.equal(BOB_BALANCE_AFTER_DIRECTFUND);

    const bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(bobChainBalance.toString()).to.be.equal(BOB_CHAIN_BALANCE_AFTER_DIRECTFUND);
  });

  it('should conduct multiple payments', async () => {
    assert(paymentChannelId);

    // First payment: Pay 50 from Alice to Bob
    await aliceClient.pay(paymentChannelId, BigInt(50));

    let paymentChannelStatus = await aliceClient.getPaymentChannel(paymentChannelId);
    let expectedPaymentChannelStatus = new PaymentChannelInfo({
      iD: paymentChannelId,
      status: ChannelStatus.Open,
      balance: new PaymentChannelBalance({
        assetAddress: asset,
        payee: ACTORS.bob.address,
        payer: ACTORS.alice.address,
        paidSoFar: BigInt(50),
        remainingFunds: BigInt(999950),
      }),
    });
    expect(paymentChannelStatus).to.deep.equal(expectedPaymentChannelStatus);

    // Second payment: Pay 100 from Alice to Bob
    await aliceClient.pay(paymentChannelId, BigInt(100));

    paymentChannelStatus = await aliceClient.getPaymentChannel(paymentChannelId);
    expectedPaymentChannelStatus = new PaymentChannelInfo({
      iD: paymentChannelId,
      status: ChannelStatus.Open,
      balance: new PaymentChannelBalance({
        assetAddress: asset,
        payee: ACTORS.bob.address,
        payer: ACTORS.alice.address,
        paidSoFar: BigInt(150),
        remainingFunds: BigInt(999850),
      }),
    });
    expect(paymentChannelStatus).to.deep.equal(expectedPaymentChannelStatus);

    const aliceBalance = await getBalanceByAddress(ACTORS.alice.address, DEFAULT_CHAIN_URL);
    expect(aliceBalance.toString()).to.be.equal(ALICE_BALANCE_AFTER_DIRECTFUND);

    const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(aliceChainBalance.toString()).to.be.equal(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND);

    const bobBalance = await getBalanceByAddress(ACTORS.bob.address, DEFAULT_CHAIN_URL);
    expect(bobBalance.toString()).to.be.equal(BOB_BALANCE_AFTER_DIRECTFUND);

    const bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(bobChainBalance.toString()).to.be.equal(BOB_CHAIN_BALANCE_AFTER_DIRECTFUND);
  });

  it('should close virtual channel', async () => {
    const closeVirtualChannelObjectiveId = await aliceClient.closeVirtualChannel(paymentChannelId);
    await aliceClient.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();

    const paymentChannelStatus = await aliceClient.getPaymentChannel(paymentChannelId);
    const expectedPaymentChannelStatus = new PaymentChannelInfo({
      iD: paymentChannelId,
      status: ChannelStatus.Complete,
      balance: new PaymentChannelBalance({
        assetAddress: asset,
        payee: ACTORS.bob.address,
        payer: ACTORS.alice.address,
        paidSoFar: BigInt(150),
        remainingFunds: BigInt(999850),
      }),
    });
    expect(paymentChannelStatus).to.deep.equal(expectedPaymentChannelStatus);

    const aliceBalance = await getBalanceByAddress(ACTORS.alice.address, DEFAULT_CHAIN_URL);
    expect(aliceBalance.toString()).to.be.equal(ALICE_BALANCE_AFTER_DIRECTFUND);

    const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(aliceChainBalance.toString()).to.be.equal(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND);

    const bobBalance = await getBalanceByAddress(ACTORS.bob.address, DEFAULT_CHAIN_URL);
    expect(bobBalance.toString()).to.be.equal(BOB_BALANCE_AFTER_DIRECTFUND);

    const bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(bobChainBalance.toString()).to.be.equal(BOB_CHAIN_BALANCE_AFTER_DIRECTFUND);
  });

  it('should close ledger channel', async () => {
    const closeLedgerChannelObjectiveId = await aliceClient.closeLedgerChannel(ledgerChannelId);
    await aliceClient.objectiveCompleteChan(closeLedgerChannelObjectiveId).shift();

    const ledgerChannelStatus = await aliceClient.getLedgerChannel(ledgerChannelId);
    const expectedLedgerChannelStatus = new LedgerChannelInfo({
      iD: ledgerChannelId,
      status: ChannelStatus.Complete,
      balance: new LedgerChannelBalance({
        assetAddress: asset,
        hub: ACTORS.bob.address,
        client: ACTORS.alice.address,
        hubBalance: BigInt(1000150),
        clientBalance: BigInt(999850),
      }),
    });
    expect(ledgerChannelStatus).to.deep.equal(expectedLedgerChannelStatus);

    const aliceBalance = await getBalanceByAddress(ACTORS.alice.address, DEFAULT_CHAIN_URL);
    expect(aliceBalance.toString()).to.be.equal(ALICE_BALANCE_AFTER_DIRECTDEFUND);

    const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(Number(aliceChainBalance)).to.be.lessThan(Number(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND));

    const bobBalance = await getBalanceByAddress(ACTORS.bob.address, DEFAULT_CHAIN_URL);
    expect(bobBalance.toString()).to.be.equal(BOB_BALANCE_AFTER_DIRECTDEFUND);

    const bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    expect(bobChainBalance.toString()).to.be.equal(BOB_CHAIN_BALANCE_AFTER_DIRECTDEFUND);
  });
});
