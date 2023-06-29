import yargs from 'yargs';
import debug from 'debug';
import assert from 'assert';
import 'dotenv/config';

import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
} from '@cerc-io/util';
import { MemStore } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { createP2PMessageService, waitForPeerInfoExchange } from './utils/index';
import { DirectFundParams, VirtualFundParams } from './types';

const log = debug('ts-nitro:server');

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  port: {
    alias: 'p',
    type: 'number',
    require: true,
    demandOption: true,
    describe: 'Message service port',
  },
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
  cpPeerId: {
    type: 'string',
    describe: "Counterparty's peer id",
  },
  cpPort: {
    type: 'number',
    describe: "Counterparty's message service port",
  },
  directFund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to create a ledger with the given counterparty',
  },
  virtualFund: {
    type: 'boolean',
    default: false,
    describe: 'Whether to create a virtual payment with the given counterparty',
  },
}).argv;

const main = async () => {
  const argv = getArgv();
  assert(process.env.RELAY_MULTIADDR, 'RELAY_MULTIADDR should be set in .env');

  const store = new MemStore(hex2Bytes(argv.pk));
  const msgService = await createP2PMessageService(process.env.RELAY_MULTIADDR, argv.port, store.getAddress());

  const client = await setupClient(
    msgService,
    store,
    {
      chainURL: argv.chainurl,
      chainPk: argv.chainpk,
    },
  );

  log('Started P2PMessageService');

  if (argv.counterparty) {
    if (argv.cpPeerId) {
      assert(argv.cpPort, 'Specify counterparty message service port');

      const { peerIdFromString } = await import('@libp2p/peer-id');

      const peerInfo = {
        port: argv.cpPort,
        id: peerIdFromString(argv.cpPeerId),
        address: argv.counterparty,
        ipAddress: '127.0.0.1',
      };

      log('Adding peer', peerInfo);
      await msgService.addPeers([peerInfo]);
    } else {
      // Wait for a peer to be discovered
      await waitForPeerInfoExchange(1, [msgService]);
    }

    const counterParty = argv.counterparty;
    const asset = `0x${'00'.repeat(20)}`;

    if (argv.directFund) {
      const directFundparams: DirectFundParams = {
        counterParty,
        challengeDuration: 0,
        outcome: createOutcome(
          asset,
          client.address,
          counterParty,
          1_000_000,
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
      log(`Leger channel created with id ${ledgerChannelResponse.channelId.string()}\n`);
    }

    if (argv.virtualFund) {
      const virtualFundparams: VirtualFundParams = {
        counterParty,
        intermediaries: [],
        challengeDuration: 0,
        outcome: createOutcome(
          asset,
          client.address,
          counterParty,
          1_000,
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
      log(`Virtual payment channel created with id ${virtualPaymentChannelResponse.channelId.string()}\n`);
    }

    // TODO: Update instructions in browser setup
    // TODO: Update instructions for ts-nitro - go-nitro setup
  }
};

main()
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
