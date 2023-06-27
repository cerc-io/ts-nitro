import yargs from 'yargs';
import debug from 'debug';
import assert from 'assert';

import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
} from '@cerc-io/util';

import { MemStore } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import { createP2PMessageService, waitForPeerInfoExchange } from './utils/index';
import { DirectFundParams } from './types';

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
  directFund: {
    type: 'string',
    describe: 'Counterparty to create a ledger channel against',
  },
  cpPeerId: {
    type: 'string',
    describe: "Counterparty's peer id",
  },
  cpPort: {
    type: 'number',
    describe: "Counterparty's message service port",
  },
}).argv;

const main = async () => {
  const argv = getArgv();

  const store = new MemStore(hex2Bytes(argv.pk));
  const msgService = await createP2PMessageService(argv.port, store.getAddress());

  const client = await setupClient(
    msgService,
    store,
    {
      chainURL: argv.chainurl,
      chainPk: argv.chainpk,
    },
  );

  log('Started P2PMessageService');

  if (argv.directFund) {
    if (argv.cpPeerId) {
      assert(argv.cpPort, 'Specify counterparty message service port');

      const { peerIdFromString } = await import('@libp2p/peer-id');

      const peerInfo = {
        port: argv.cpPort,
        id: peerIdFromString(argv.cpPeerId),
        address: argv.directFund,
        ipAddress: '127.0.0.1',
      };

      log('Adding peer', peerInfo);
      await msgService.addPeers([peerInfo]);
    } else {
      // Wait for a peer to be discovered
      await waitForPeerInfoExchange(1, [msgService]);
    }

    const counterParty = argv.directFund;
    const asset = `0x${'00'.repeat(20)}`;
    const params: DirectFundParams = {
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

    await client.createLedgerChannel(
      params.counterParty,
      params.challengeDuration,
      params.outcome,
    );
  }
};

main()
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
