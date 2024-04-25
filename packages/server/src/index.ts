import yargs from 'yargs';
import debug from 'debug';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import { utils } from '@cerc-io/nitro-node';
import {
  JSONbigNative, hex2Bytes, DEFAULT_CHAIN_URL_WEBSOCKET, DEFAULT_ASSET,
} from '@cerc-io/nitro-util';

import { waitForMultiplePeers } from './utils/index';
import contractAddresses from './nitro-addresses.json';

const log = debug('ts-nitro:server');

const {
  createPeerIdFromKey,
  createPeerAndInit,
  subscribeVoucherLogs,
} = utils;

const DEFAULT_LEDGER_AMOUNT = '1000000';
const DEFAULT_VIRTUAL_CHANNEL_AMOUNT = '1000';
const DEFAULT_PAY_AMOUNT = '0';
const DEFAULT_DURABLE_STORE_FOLDER = './out/nitro-store';

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  pk: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Private key for the client',
  },
  chainPk: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Private key to use when interacting with the chain',
  },
  chainUrl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: DEFAULT_CHAIN_URL_WEBSOCKET,
  },
  contracts: {
    type: 'string',
    describe: 'File path of the deployed nitro contract addresses',
  },
  counterParty: {
    type: 'string',
    describe: 'Counterparty to create channel(s) against',
  },
  additionalPeers: {
    type: 'string',
    describe: 'JSON file path with peer multiaddrs to be added',
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
    type: 'string',
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
  useDurableStore: {
    type: 'boolean',
    default: false,
    describe: 'Specifies whether to use a durable store or an in-memory store.',
  },
  durableStoreFolder: {
    type: 'string',
    describe: 'Directory path to use for DurableStore',
    default: DEFAULT_DURABLE_STORE_FOLDER,
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

  const envAsset = process.env.ASSET_ADDRESS;
  const asset = (envAsset === undefined || envAsset === '') ? DEFAULT_ASSET : envAsset;

  const peerIdObj = await createPeerIdFromKey(hex2Bytes(argv.pk));
  const peer = await createPeerAndInit(process.env.RELAY_MULTIADDR, {}, peerIdObj);

  const nitro = await utils.Nitro.setupNode(
    argv.pk,
    argv.chainUrl,
    argv.chainPk,
    contractAddresses,
    peer,
    argv.useDurableStore,
    argv.durableStoreFolder && path.resolve(argv.durableStoreFolder),
    undefined,
    asset,
  );

  subscribeVoucherLogs(nitro.node);
  log('Started P2PMessageService and subscribed to vouchers');

  const peersToConnect: string[] = argv.counterParty ? [argv.counterParty] : [];
  peersToConnect.push(...(argv.intermediaries as string[]));

  let peersToAdd: any[] = [];
  if (argv.additionalPeers) {
    const data = fs.readFileSync(path.resolve(argv.additionalPeers), 'utf-8');
    peersToAdd = JSON.parse(data);

    for await (const [, peerToAdd] of Array.from(peersToAdd).entries()) {
      log('Adding client', peerToAdd.address);
      await nitro.addPeerByMultiaddr(peerToAdd.address, peerToAdd.multiaddr);
      peersToConnect.push(peerToAdd.address);
    }
  }

  // Wait for peers to be discovered
  const intermediariesCount = argv.intermediaries.length;
  if (intermediariesCount > 0) {
    log(`Waiting for ${intermediariesCount} intermediaries to be discovered`);
  }
  await waitForMultiplePeers(intermediariesCount - peersToAdd.length + 1, [nitro.msgService]);

  // Check that all required peers are dialable
  for await (const peerToConnect of peersToConnect) {
    const [dialable, errString] = await nitro.isPeerDialable(peerToConnect);
    if (!dialable) {
      throw new Error(`Not able to dial peer with address ${peerToConnect}: ${errString}`);
    }
  }

  let ledgerChannelIdString = argv.ledgerChannel;
  let paymentChannelIdString = argv.paymentChannel;
  const { counterParty } = argv;

  if (argv.directFund) {
    assert(counterParty, 'Specify counterparty address');

    ledgerChannelIdString = await nitro.directFund(
      counterParty,
      argv.amount ?? DEFAULT_LEDGER_AMOUNT,
    );
  }

  if (argv.virtualFund) {
    assert(counterParty, 'Specify counterparty address');

    paymentChannelIdString = await nitro.virtualFund(
      counterParty,
      argv.amount ?? DEFAULT_VIRTUAL_CHANNEL_AMOUNT,
      argv.intermediaries,
    );
  }

  if (argv.pay) {
    assert(paymentChannelIdString, 'Provide payment-channel id for payment');
    const sentVoucher = await nitro.pay(paymentChannelIdString, argv.amount ?? DEFAULT_PAY_AMOUNT);

    log(`Voucher sent for amount ${sentVoucher.amount}`);
    log(`Hash: ${sentVoucher.hash()} Sig: ${utils.getJoinedSignature(sentVoucher.signature)}`);
  }

  if (argv.virtualDefund) {
    assert(paymentChannelIdString, 'Provide payment-channel id to close channel');
    await nitro.virtualDefund(paymentChannelIdString);

    log(`Virtual payment channel with id ${paymentChannelIdString} closed`);
  }

  if (argv.directDefund) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id to close channel');
    await nitro.directDefund(ledgerChannelIdString);

    log(`Ledger channel with id ${ledgerChannelIdString} closed`);
  }

  if (argv.getPaymentChannel) {
    assert(paymentChannelIdString, 'Provide payment-channel id for get-payment-channel');
    const paymentChannelStatus = await nitro.getPaymentChannel(paymentChannelIdString);

    log(
      `Virtual payment channel ${paymentChannelIdString} status:\n`,
      JSONbigNative.stringify(paymentChannelStatus, null, 2),
    );
  }

  if (argv.getLedgerChannel) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id for get-ledger-channel');
    const ledgerChannelStatus = await nitro.getLedgerChannel(ledgerChannelIdString);

    log(
      `Ledger channel ${ledgerChannelIdString} status:\n`,
      JSONbigNative.stringify(ledgerChannelStatus, null, 2),
    );
  }

  if (argv.getAllLedgerChannels) {
    const allLedgerChannels = await nitro.getAllLedgerChannels();
    log(
      'All ledger channel:\n',
      JSONbigNative.stringify(allLedgerChannels, null, 2),
    );
  }

  if (argv.getPaymentChannelsByLedger) {
    assert(ledgerChannelIdString, 'Provide ledger-channel id to get all active payment channels');
    const paymentChannelsByLedger = await nitro.getPaymentChannelsByLedger(ledgerChannelIdString);

    log(
      `All active payment channels on ledger channel ${ledgerChannelIdString}:\n`,
      JSONbigNative.stringify(paymentChannelsByLedger, null, 2),
    );
  }

  if (!argv.wait) {
    // Workaround for error on closing payment channel
    await new Promise<void>((resolve) => { setTimeout(() => resolve(), 1000); });

    await nitro.close();
  }
};

main()
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err.message);
});
