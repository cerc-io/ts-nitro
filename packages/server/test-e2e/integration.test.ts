import assert from 'assert';
import { expect } from 'chai';
import 'mocha';
import { providers } from 'ethers';

import {
  Client, MemStore, Metrics, P2PMessageService, utils, Destination, LedgerChannelInfo,
  ChannelStatus, LedgerChannelBalance, PaymentChannelInfo, PaymentChannelBalance, ObjectiveResponse,
} from '@cerc-io/nitro-client';
import {
  hex2Bytes, DEFAULT_CHAIN_URL, getBalanceByKey, getBalanceByAddress, deployContracts,
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
  getMetricsKey, getMetricsMessageObj, getMetricsMessage, ContractAddresses,
} from './utils';

const {
  setupClient,
  createOutcome,
  ACTORS,
  createPeerIdFromKey,
  createPeerAndInit,
} = utils;

const ALICE_BALANCE_AFTER_DIRECTFUND = '0';
const ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND = '9999990364419449297570';
const ALICE_BALANCE_AFTER_DIRECTDEFUND = '999850';
const ALICE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '1999700';
const BOB_BALANCE_AFTER_DIRECTFUND = '0';
const BOB_CHAIN_BALANCE_AFTER_DIRECTFUND = '10000000000000000000000';
const BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY = '10000000000000000000000';
const BOB_BALANCE_AFTER_DIRECTDEFUND = '1000150';
const BOB_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '3000150';
const CHARLIE_BALANCE_AFTER_DIRECTFUND = '0';
const CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY = '10000000000000000000000';
const CHARLIE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '1000150';
const INITIAL_LEDGER_AMOUNT = 1_000_000;
const INITIAL_VIRTUAL_CHANNEL_AMOUNT = 1_000_000;
const ASSET = `0x${'00'.repeat(20)}`;

async function createClient(actor: utils.Actor, contractAddresses: ContractAddresses): Promise<[Client, P2PMessageService, Metrics]> {
  const clientStore = new MemStore(hex2Bytes(actor.privateKey));

  const clientPeerIdObj = await createPeerIdFromKey(hex2Bytes(actor.privateKey));
  const clientPeer = await createPeerAndInit(process.env.RELAY_MULTIADDR!, {}, clientPeerIdObj);

  const clientMsgService = await P2PMessageService.newMessageService(
    clientStore.getAddress(),
    clientPeer,
  );
  const clientMetrics = new Metrics();

  const client = await setupClient(
    clientMsgService,
    clientStore,
    {
      chainPk: ACTORS.alice.chainPrivateKey,
      chainURL: DEFAULT_CHAIN_URL,
      contractAddresses,
    },
    clientMetrics,
  );
  expect(client.address).to.equal(actor.address);

  return [client, clientMsgService, clientMetrics];
}

async function setUpLedgerChannel(clientA: Client, clientB: Client): Promise<ObjectiveResponse> {
  const counterParty = clientB.address;

  const params: DirectFundParams = {
    counterParty,
    challengeDuration: 0,
    outcome: createOutcome(
      ASSET,
      clientA.address,
      counterParty,
      INITIAL_LEDGER_AMOUNT,
    ),
    appDefinition: ASSET,
    appData: '0x00',
    nonce: Date.now(),
  };
  const response = await clientA.createLedgerChannel(
    params.counterParty,
    params.challengeDuration,
    params.outcome,
  );

  await clientA.objectiveCompleteChan(response.id).shift();
  return response;
}

async function setUpVirtualChannel(clientA: Client, clientB: Client, intermediaries: string[]): Promise<ObjectiveResponse> {
  const counterParty = clientB.address;

  const params: VirtualFundParams = {
    intermediaries,
    counterParty,
    challengeDuration: 0,
    outcome: createOutcome(
      ASSET,
      clientA.address,
      counterParty,
      INITIAL_VIRTUAL_CHANNEL_AMOUNT,
    ),
    nonce: Date.now(),
    appDefinition: ASSET,
  };
  const response = await clientA.createVirtualPaymentChannel(
    params.intermediaries,
    params.counterParty,
    params.challengeDuration,
    params.outcome,
  );

  await clientA.objectiveCompleteChan(response.id).shift();
  return response;
}

async function checkLedgerChannel(
  client: Client,
  hub: Client,
  ledgerChannelId: Destination,
  status: ChannelStatus,
  clientBalance: bigint,
  hubBalance: bigint,
): Promise<void> {
  const ledgerChannelStatus = await client.getLedgerChannel(ledgerChannelId);

  const expectedLedgerChannelStatus = new LedgerChannelInfo({
    iD: ledgerChannelId,
    status,
    balance: new LedgerChannelBalance({
      assetAddress: ASSET,
      hub: hub.address,
      client: client.address,
      hubBalance,
      clientBalance,
    }),
  });
  expect(ledgerChannelStatus).to.deep.equal(expectedLedgerChannelStatus);
}

async function checkVirtualChannel(
  payer: Client,
  payee: Client,
  paymentChannelId: Destination,
  status: ChannelStatus,
  paidSoFar: bigint,
  remainingFunds: bigint,
): Promise<void> {
  const paymentChannelStatus = await payer.getPaymentChannel(paymentChannelId);

  const expectedPaymentChannelStatus = new PaymentChannelInfo({
    iD: paymentChannelId,
    status,
    balance: new PaymentChannelBalance({
      assetAddress: ASSET,
      payee: payee.address,
      payer: payer.address,
      paidSoFar,
      remainingFunds,
    }),
  });
  expect(paymentChannelStatus).to.deep.equal(expectedPaymentChannelStatus);
}

async function checkBalance(
  client: utils.Actor,
  chainURL: string,
  clientBalance: string,
  clientChainBalance?: string,
): Promise<void> {
  const balance = await getBalanceByAddress(client.address, chainURL);
  expect(balance.toString()).to.be.equal(clientBalance);

  if (clientChainBalance) {
    const chainBalance = await getBalanceByKey(client.chainPrivateKey, chainURL);
    expect(chainBalance.toString()).to.be.equal(clientChainBalance);
  }
}

describe('test payment flows', () => {
  let contractAddresses: ContractAddresses;

  before(async () => {
    const provider = new providers.JsonRpcProvider(DEFAULT_CHAIN_URL);
    const [
      nitroAdjudicatorAddress,
      virtualPaymentAppAddress,
      consensusAppAddress,
    ] = await deployContracts(provider.getSigner());

    contractAddresses = {
      nitroAdjudicatorAddress,
      virtualPaymentAppAddress,
      consensusAppAddress,
    };
  });

  describe('test payment flow without an intermediary', () => {
    let aliceClient: Client;
    let aliceMetrics: Metrics;
    let aliceMsgService: P2PMessageService;
    let bobClient: Client;
    let bobMetrics: Metrics;
    let bobMsgService: P2PMessageService;
    let ledgerChannel: ObjectiveResponse;
    let virtualPaymentChannel: ObjectiveResponse;

    it('should instantiate clients', async () => {
      assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

      [aliceClient, aliceMsgService, aliceMetrics] = await createClient(ACTORS.alice, contractAddresses);
      [bobClient, bobMsgService, bobMetrics] = await createClient(ACTORS.bob, contractAddresses);

      await waitForPeerInfoExchange(1, [aliceMsgService, bobMsgService]);

      expect(aliceMetrics.getMetrics()).to.includes.keys(...getMetricsKey(METRICS_KEYS_CLIENT_INSTANTIATION, ACTORS.alice.address));
      expect(bobMetrics.getMetrics()).to.includes.keys(...getMetricsKey(METRICS_KEYS_CLIENT_INSTANTIATION, ACTORS.bob.address));
    });

    it('should create a ledger channel', async () => {
      ledgerChannel = await setUpLedgerChannel(aliceClient, bobClient);

      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannel.channelId,
        ChannelStatus.Open,
        BigInt(INITIAL_LEDGER_AMOUNT),
        BigInt(INITIAL_LEDGER_AMOUNT),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTFUND,
        ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

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
    });

    it('should create a virtual channel', async () => {
      virtualPaymentChannel = await setUpVirtualChannel(aliceClient, bobClient, []);
      await checkVirtualChannel(
        aliceClient,
        bobClient,
        virtualPaymentChannel.channelId,
        ChannelStatus.Open,
        BigInt(0),
        BigInt(INITIAL_VIRTUAL_CHANNEL_AMOUNT),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTFUND,
        ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );
    });

    it('should conduct multiple payments', async () => {
      // First payment: Pay 50 from Alice to Bob
      await aliceClient.pay(virtualPaymentChannel.channelId, BigInt(50));
      await checkVirtualChannel(
        aliceClient,
        bobClient,
        virtualPaymentChannel.channelId,
        ChannelStatus.Open,
        BigInt(50),
        BigInt(999950),
      );

      // Second payment: Pay 100 from Alice to Bob
      await aliceClient.pay(virtualPaymentChannel.channelId, BigInt(100));
      await checkVirtualChannel(
        aliceClient,
        bobClient,
        virtualPaymentChannel.channelId,
        ChannelStatus.Open,
        BigInt(150),
        BigInt(999850),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTFUND,
        ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );
    });

    it('should close the virtual channel', async () => {
      const closeVirtualChannelObjectiveId = await aliceClient.closeVirtualChannel(virtualPaymentChannel.channelId);
      await aliceClient.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();

      await checkVirtualChannel(
        aliceClient,
        bobClient,
        virtualPaymentChannel.channelId,
        ChannelStatus.Complete,
        BigInt(150),
        BigInt(999850),
      );

      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannel.channelId,
        ChannelStatus.Open,
        BigInt(999850),
        BigInt(1000150),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTFUND,
        ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );
    });

    it('should close the ledger channel', async () => {
      const closeLedgerChannel = await aliceClient.closeLedgerChannel(ledgerChannel.channelId);
      await aliceClient.objectiveCompleteChan(closeLedgerChannel).shift();

      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannel.channelId,
        ChannelStatus.Complete,
        BigInt(999850),
        BigInt(1000150),
      );

      const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
      expect(Number(aliceChainBalance)).to.be.lessThan(Number(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND));

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND,
      );

      await aliceClient.close();
      await bobClient.close();
    });
  });

  describe('test payment flow with an intermediary', () => {
    let aliceClient: Client;
    let aliceMsgService: P2PMessageService;
    let bobClient: Client;
    let bobMsgService: P2PMessageService;
    let charlieClient: Client;
    let charlieMsgService: P2PMessageService;
    let ledgerChannelAliceBob: ObjectiveResponse;
    let ledgerChannelBobCharlie: ObjectiveResponse;
    let virtualPaymentChannelAliceCharlie: ObjectiveResponse;

    it('should instantiate clients', async () => {
      assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

      [aliceClient, aliceMsgService] = await createClient(ACTORS.alice, contractAddresses);
      [bobClient, bobMsgService] = await createClient(ACTORS.bob, contractAddresses);
      [charlieClient, charlieMsgService] = await createClient(ACTORS.charlie, contractAddresses);

      await waitForPeerInfoExchange(2, [aliceMsgService, bobMsgService, charlieMsgService]);
    });

    it('should create ledger channels', async () => {
      ledgerChannelAliceBob = await setUpLedgerChannel(aliceClient, bobClient);
      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannelAliceBob.channelId,
        ChannelStatus.Open,
        BigInt(INITIAL_LEDGER_AMOUNT),
        BigInt(INITIAL_LEDGER_AMOUNT),
      );

      ledgerChannelBobCharlie = await setUpLedgerChannel(bobClient, charlieClient);
      await checkLedgerChannel(
        bobClient,
        charlieClient,
        ledgerChannelBobCharlie.channelId,
        ChannelStatus.Open,
        BigInt(INITIAL_LEDGER_AMOUNT),
        BigInt(INITIAL_LEDGER_AMOUNT),
      );

      const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
      expect(Number(aliceChainBalance)).to.be.lessThan(Number(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND));

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );
    });

    it('should create virtual channels', async () => {
      virtualPaymentChannelAliceCharlie = await setUpVirtualChannel(aliceClient, charlieClient, [bobClient.address]);
      await checkVirtualChannel(
        aliceClient,
        charlieClient,
        virtualPaymentChannelAliceCharlie.channelId,
        ChannelStatus.Open,
        BigInt(0),
        BigInt(INITIAL_VIRTUAL_CHANNEL_AMOUNT),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );
    });

    it('should conduct multiple payments', async () => {
      await aliceClient.pay(virtualPaymentChannelAliceCharlie.channelId, BigInt(50));
      await checkVirtualChannel(
        aliceClient,
        charlieClient,
        virtualPaymentChannelAliceCharlie.channelId,
        ChannelStatus.Open,
        BigInt(50),
        BigInt(999950),
      );

      await aliceClient.pay(virtualPaymentChannelAliceCharlie.channelId, BigInt(100));
      await checkVirtualChannel(
        aliceClient,
        charlieClient,
        virtualPaymentChannelAliceCharlie.channelId,
        ChannelStatus.Open,
        BigInt(150),
        BigInt(999850),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );
    });

    it('should close the virtual channel', async () => {
      const closeVirtualChannelObjectiveId = await aliceClient.closeVirtualChannel(virtualPaymentChannelAliceCharlie.channelId);
      await aliceClient.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();

      await checkVirtualChannel(
        aliceClient,
        charlieClient,
        virtualPaymentChannelAliceCharlie.channelId,
        ChannelStatus.Complete,
        BigInt(150),
        BigInt(999850),
      );

      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannelAliceBob.channelId,
        ChannelStatus.Open,
        BigInt(999850),
        BigInt(1000150),
      );

      await checkLedgerChannel(
        bobClient,
        charlieClient,
        ledgerChannelBobCharlie.channelId,
        ChannelStatus.Open,
        BigInt(0),
        BigInt(0),
      );

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );
    });

    it('should close the ledger channels', async () => {
      const closeLedgerChannelAliceBob = await aliceClient.closeLedgerChannel(ledgerChannelAliceBob.channelId);
      await aliceClient.objectiveCompleteChan(closeLedgerChannelAliceBob).shift();

      await checkLedgerChannel(
        aliceClient,
        bobClient,
        ledgerChannelAliceBob.channelId,
        ChannelStatus.Complete,
        BigInt(999850),
        BigInt(1000150),
      );

      const closeLedgerChannelBobCharlie = await bobClient.closeLedgerChannel(ledgerChannelBobCharlie.channelId);
      await bobClient.objectiveCompleteChan(closeLedgerChannelBobCharlie).shift();

      await checkLedgerChannel(
        bobClient,
        charlieClient,
        ledgerChannelBobCharlie.channelId,
        ChannelStatus.Complete,
        BigInt(999850),
        BigInt(1000150),
      );

      const aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
      expect(Number(aliceChainBalance)).to.be.lessThan(Number(ALICE_CHAIN_BALANCE_AFTER_DIRECTFUND));

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
        BOB_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
        CHARLIE_CHAIN_BALANCE_AFTER_DIRECTFUND_WITH_INTERMEDIARY,
      );

      await aliceClient.close();
      await bobClient.close();
      await charlieClient.close();
    });
  });
});
