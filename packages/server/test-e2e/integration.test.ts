import 'mocha';
import assert from 'assert';
import { expect } from 'chai';
import { BigNumber, providers } from 'ethers';

import {
  Client, Metrics, P2PMessageService, utils, Destination, LedgerChannelInfo,
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
  createOutcome,
  ACTORS,
  createPeerIdFromKey,
  createPeerAndInit,
} = utils;

const ALICE_BALANCE_AFTER_DIRECTFUND = '0';
const ALICE_BALANCE_AFTER_DIRECTDEFUND = '999850';
const ALICE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '1999700';
const BOB_BALANCE_AFTER_DIRECTFUND = '0';
const BOB_BALANCE_AFTER_DIRECTDEFUND = '1000150';
const BOB_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '3000150';
const CHARLIE_BALANCE_AFTER_DIRECTFUND = '0';
const CHARLIE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY = '1000150';
const INITIAL_LEDGER_AMOUNT = 1_000_000;
const INITIAL_VIRTUAL_CHANNEL_AMOUNT = 1_000_000;
const ASSET = `0x${'00'.repeat(20)}`;

async function createClient(actor: utils.Actor, contractAddresses: ContractAddresses): Promise<[Client, P2PMessageService, Metrics]> {
  const clientPeerIdObj = await createPeerIdFromKey(hex2Bytes(actor.privateKey));
  const clientPeer = await createPeerAndInit(process.env.RELAY_MULTIADDR!, {}, clientPeerIdObj);
  const clientMetrics = new Metrics();

  const nitro = await utils.Nitro.setupClient(
    actor.privateKey,
    DEFAULT_CHAIN_URL,
    actor.chainPrivateKey,
    contractAddresses,
    clientPeer,
    undefined,
    clientMetrics,
  );

  expect(nitro.client.address).to.equal(actor.address);

  return [nitro.client, nitro.msgService, clientMetrics];
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
  const response = await clientA.createPaymentChannel(
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
  clientChainBalance?: BigNumber,
): Promise<void> {
  const balance = await getBalanceByAddress(client.address, chainURL);
  expect(balance.toString()).to.be.equal(clientBalance);

  if (clientChainBalance) {
    const chainBalance = await getBalanceByKey(client.chainPrivateKey, chainURL);
    expect(chainBalance.toString()).to.be.equal(clientChainBalance.toString());
  }
}

async function checkAndUpdateChainBalance(
  client: utils.Actor,
  chainURL: string,
  prevChainBalance: BigNumber,
): Promise<BigNumber> {
  const chainBalance = await getBalanceByKey(client.chainPrivateKey, chainURL);
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  expect(chainBalance.lt(prevChainBalance)).to.be.true;
  return chainBalance;
}

describe('test payment flows', () => {
  let contractAddresses: ContractAddresses;
  let aliceChainBalance: BigNumber;
  let bobChainBalance: BigNumber;
  let charlieChainBalance: BigNumber;

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

    aliceChainBalance = await getBalanceByKey(ACTORS.alice.chainPrivateKey, DEFAULT_CHAIN_URL);
    bobChainBalance = await getBalanceByKey(ACTORS.bob.chainPrivateKey, DEFAULT_CHAIN_URL);
    charlieChainBalance = await getBalanceByKey(ACTORS.charlie.chainPrivateKey, DEFAULT_CHAIN_URL);
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

    after('cleanup', async () => {
      await aliceClient.close();
      await bobClient.close();
    });

    it('should instantiate clients', async () => {
      assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

      [aliceClient, aliceMsgService, aliceMetrics] = await createClient(ACTORS.alice, contractAddresses);
      [bobClient, bobMsgService, bobMetrics] = await createClient(ACTORS.bob, contractAddresses);

      await waitForPeerInfoExchange([aliceMsgService, bobMsgService]);

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
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
      );

      aliceChainBalance = await checkAndUpdateChainBalance(ACTORS.alice, DEFAULT_CHAIN_URL, aliceChainBalance);
      bobChainBalance = await checkAndUpdateChainBalance(ACTORS.bob, DEFAULT_CHAIN_URL, bobChainBalance);

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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        bobChainBalance,
      );
    });

    it('should conduct multiple payments', async () => {
      // First payment: Pay 50 from Alice to Bob
      await aliceClient.pay(virtualPaymentChannel.channelId, BigInt(50));
      await aliceClient.sentVouchers().shift();
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
      await aliceClient.sentVouchers().shift();
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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        bobChainBalance,
      );
    });

    it('should close the virtual channel', async () => {
      const closeVirtualChannelObjectiveId = await aliceClient.closePaymentChannel(virtualPaymentChannel.channelId);
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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTFUND,
        bobChainBalance,
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

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        bobChainBalance,
      );

      aliceChainBalance = await checkAndUpdateChainBalance(ACTORS.alice, DEFAULT_CHAIN_URL, aliceChainBalance);
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

    after('cleanup', async () => {
      await aliceClient.close();
      await bobClient.close();
      await charlieClient.close();
    });

    it('should instantiate clients', async () => {
      assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

      [aliceClient, aliceMsgService] = await createClient(ACTORS.alice, contractAddresses);
      [bobClient, bobMsgService] = await createClient(ACTORS.bob, contractAddresses);
      [charlieClient, charlieMsgService] = await createClient(ACTORS.charlie, contractAddresses);

      await waitForPeerInfoExchange([aliceMsgService, bobMsgService, charlieMsgService]);
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

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
      );

      aliceChainBalance = await checkAndUpdateChainBalance(ACTORS.alice, DEFAULT_CHAIN_URL, aliceChainBalance);
      bobChainBalance = await checkAndUpdateChainBalance(ACTORS.bob, DEFAULT_CHAIN_URL, bobChainBalance);
      charlieChainBalance = await checkAndUpdateChainBalance(ACTORS.charlie, DEFAULT_CHAIN_URL, charlieChainBalance);
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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        bobChainBalance,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        charlieChainBalance,
      );
    });

    it('should conduct multiple payments', async () => {
      await aliceClient.pay(virtualPaymentChannelAliceCharlie.channelId, BigInt(50));
      await aliceClient.sentVouchers().shift();
      await checkVirtualChannel(
        aliceClient,
        charlieClient,
        virtualPaymentChannelAliceCharlie.channelId,
        ChannelStatus.Open,
        BigInt(50),
        BigInt(999950),
      );

      await aliceClient.pay(virtualPaymentChannelAliceCharlie.channelId, BigInt(100));
      await aliceClient.sentVouchers().shift();
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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        bobChainBalance,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        charlieChainBalance,
      );
    });

    it('should close the virtual channel', async () => {
      const closeVirtualChannelObjectiveId = await aliceClient.closePaymentChannel(virtualPaymentChannelAliceCharlie.channelId);
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
        aliceChainBalance,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND,
        bobChainBalance,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTFUND,
        charlieChainBalance,
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

      await checkBalance(
        ACTORS.alice,
        DEFAULT_CHAIN_URL,
        ALICE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.bob,
        DEFAULT_CHAIN_URL,
        BOB_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
      );

      await checkBalance(
        ACTORS.charlie,
        DEFAULT_CHAIN_URL,
        CHARLIE_BALANCE_AFTER_DIRECTDEFUND_WITH_INTERMEDIARY,
        charlieChainBalance,
      );

      aliceChainBalance = await checkAndUpdateChainBalance(ACTORS.alice, DEFAULT_CHAIN_URL, aliceChainBalance);
      bobChainBalance = await checkAndUpdateChainBalance(ACTORS.bob, DEFAULT_CHAIN_URL, bobChainBalance);
    });
  });
});
