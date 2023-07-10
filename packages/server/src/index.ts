import yargs from 'yargs';
import debug from 'debug';
import assert from 'assert';
import path from 'path';
import 'dotenv/config';

import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
  subscribeVoucherLogs,
} from '@cerc-io/util';
import {
  Destination, DurableStore, MemStore, P2PMessageService, Store,
} from '@cerc-io/nitro-client';
import { JSONbigNative, hex2Bytes } from '@cerc-io/nitro-util';

import { waitForPeerInfoExchange } from './utils/index';
import { DirectFundParams, VirtualFundParams } from './types';

const log = debug('ts-nitro:server');

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  pk: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Private key for the client',
  },
  chainpk: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Private key to use when interacting with the chain',
  },
  chainurl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: DEFAULT_CHAIN_URL,
  },
  counterparty: {
    type: 'string',
    describe: 'Counterparty to create channel(s) against',
  },
  cpMultiaddr: {
    type: 'string',
    describe: "Counterparty's peer multiaddr",
  },
  directFund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to create a ledger channel with the given counterparty',
  },
  virtualFund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to create a virtual payment channel with the given counterparty',
  },
  getLedgerChannel: {
    type: 'boolean',
    default: false,
    describe: 'Whether to get information about a ledger channel',
  },
  getAllLedgerChannels: {
    type: 'boolean',
    default: false,
    describe: 'Whether to get information about all ledger channels',
  },
  getPaymentChannel: {
    type: 'boolean',
    default: false,
    describe: 'Whether to get information about a virtual payment channel',
  },
  getPaymentChannelsByLedger: {
    type: 'boolean',
    default: false,
    describe: 'Whether to get information about all active payment channels that are funded by the given ledger channel',
  },
  pay: {
    type: 'boolean',
    describe: 'Whether to pay on the virtual payment channel with the given counterparty',
  },
  amount: {
    type: 'number',
    describe: 'Amount for fund and pay methods',
  },
  virtualDefund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to close a virtual payment channel with the given counterparty',
  },
  directDefund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to close a ledger channel with the given counterparty',
  },
  store: {
    type: 'string',
    describe: 'Directory path to use for DurableStore',
  },
  paymentChannel: {
    type: 'string',
    describe: 'Id of virtual payment channel to use',
  },
  ledgerChannel: {
    type: 'string',
    describe: 'Id of ledger channel to use',
  },
  wait: {
    type: 'boolean',
    default: false,
    describe: 'Whether to keep CLI running',
  },
  intermediaries: {
    type: 'array',
    default: [],
  },
}).argv;

const main = async () => {
  const argv = getArgv();
  assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

  let store: Store;
  if (argv.store) {
    store = DurableStore.newDurableStore(hex2Bytes(argv.pk), path.resolve(argv.store));
  } else {
    store = new MemStore(hex2Bytes(argv.pk));
  }

  const msgService = await P2PMessageService.newMessageService(process.env.RELAY_MULTIADDR, store.getAddress(), hex2Bytes(argv.pk));

  const client = await setupClient(
    msgService,
    store,
    {
      chainURL: argv.chainurl,
      chainPk: argv.chainpk,
    },
  );

  log('Started P2PMessageService');

  log(`Waiting for ${argv.intermediaries.length} intermediaries to be discovered`);
  await waitForPeerInfoExchange(argv.intermediaries.length, [msgService]);

  if (argv.cpMultiaddr) {
    assert(argv.counterparty, 'Specify counterparty address');

    log('Adding client', argv.counterparty);
    await msgService.addPeerByMultiaddr(argv.counterparty, argv.cpMultiaddr);
  } else {
    // Wait for a peer to be discovered
    await waitForPeerInfoExchange(1, [msgService]);
  }

  let ledgerChannelIdString = argv.ledgerChannel;
  let paymentChannelIdString = argv.paymentChannel;
  const counterParty = argv.counterparty;
  const asset = `0x${'00'.repeat(20)}`;

  if (argv.directFund) {
    assert(counterParty, 'Specify counterparty address');
    const directFundparams: DirectFundParams = {
      counterParty,
      challengeDuration: 0,
      outcome: createOutcome(
        asset,
        client.address,
        counterParty,
        argv.amount ?? 1_000_000,
      ),
      appDefinition: asset,
      appData: '0x00',
      nonce: Date.now(),
    };

    const ledgerChannelResponse = await client.createLedgerChannel(
      directFundparams.counterParty,
      directFundparams.challengeDuration,
      directFundparams.outcome,
    );

    await client.objectiveCompleteChan(ledgerChannelResponse.id).shift();
    log(`Ledger channel created with id ${ledgerChannelResponse.channelId.string()}`);
    ledgerChannelIdString = ledgerChannelResponse.channelId.string();
  }

  if (argv.virtualFund) {
    assert(counterParty, 'Specify counterparty address');
    const virtualFundparams: VirtualFundParams = {
      counterParty,
      intermediaries: argv.intermediaries,
      challengeDuration: 0,
      outcome: createOutcome(
        asset,
        client.address,
        counterParty,
        argv.amount ?? 1_000,
      ),
      appDefinition: asset,
      nonce: Date.now(),
    };

    const virtualPaymentChannelResponse = await client.createVirtualPaymentChannel(
      virtualFundparams.intermediaries,
      virtualFundparams.counterParty,
      virtualFundparams.challengeDuration,
      virtualFundparams.outcome,
    );

    await client.objectiveCompleteChan(virtualPaymentChannelResponse.id).shift();
    log(`Virtual payment channel created with id ${virtualPaymentChannelResponse.channelId.string()}`);
    paymentChannelIdString = virtualPaymentChannelResponse.channelId.string();
  }

  if (argv.pay) {
    assert(paymentChannelIdString, 'Provide payment-channel id for payment');
    const virtualPaymentChannelId = new Destination(paymentChannelIdString);
    await client.pay(virtualPaymentChannelId, BigInt(argv.amount ?? 0));

    // TODO: Wait for the payment to be processed
  }

  if (argv.virtualDefund) {
    assert(paymentChannelIdString, 'Provide payment-channel id to close channel');
    const virtualPaymentChannelId = new Destination(paymentChannelIdString);
    const closeVirtualChannelObjectiveId = await client.closeVirtualChannel(virtualPaymentChannelId);
    await client.objectiveCompleteChan(closeVirtualChannelObjectiveId).shift();
    log(`Virtual payment channel with id ${virtualPaymentChannelId.string()} closed`);
  }

  if (argv.directDefund) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id to close channel');
    const ledgerChannelId: Destination = new Destination(ledgerChannelIdString);
    const closeLedgerChannelObjectiveId = await client.closeLedgerChannel(ledgerChannelId);

    await client.objectiveCompleteChan(closeLedgerChannelObjectiveId).shift();
    log(`Ledger channel with id ${ledgerChannelId.string()} closed`);
  }

  if (argv.getPaymentChannel) {
    assert(paymentChannelIdString, 'Provide payment-channel id for get-payment-channel');
    const paymentChannelId = new Destination(paymentChannelIdString);
    const paymentChannelStatus = await client.getPaymentChannel(paymentChannelId);

    log(
      `Virtual payment channel ${paymentChannelId.string()} status:\n`,
      JSONbigNative.stringify(paymentChannelStatus, null, 2),
    );
  }

  if (argv.getLedgerChannel) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id for get-ledger-channel');
    const ledgerChannelId = new Destination(ledgerChannelIdString);
    const ledgerChannelStatus = await client.getLedgerChannel(ledgerChannelId);

    log(
      `Ledger channel ${ledgerChannelId.string()} status:\n`,
      JSONbigNative.stringify(ledgerChannelStatus, null, 2),
    );
  }

  if (argv.getAllLedgerChannels) {
    const allLedgerChannels = await client.getAllLedgerChannels();
    log(
      'All ledger channel:\n',
      JSONbigNative.stringify(allLedgerChannels, null, 2),
    );
  }

  if (argv.getPaymentChannelsByLedger) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id to get all active payment channels');
    const ledgerChannelId = new Destination(ledgerChannelIdString);
    const paymentChannelsByLedger = await client.getPaymentChannelsByLedger(ledgerChannelId);
    log(
      `All active payment channels on ledger channel ${ledgerChannelId.string()}:\n`,
      JSONbigNative.stringify(paymentChannelsByLedger, null, 2),
    );
  }

  // Call async method to log message on receiving vouchers
  subscribeVoucherLogs(client);

  // TODO: Update instructions in browser setup
  // TODO: Update instructions for ts-nitro - go-nitro setup

  if (!argv.wait) {
    // TODO: Fix closing client after creating virtual channel
    // Workaround for error on closing payment channel
    await new Promise<void>((resolve) => { setTimeout(() => resolve(), 1000); });

    await store.close();
    await msgService.close();
    // TODO: Implement
    await client.close();

    process.exit(0);
  }
};

main()
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err.message);
});
