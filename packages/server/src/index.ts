import yargs from 'yargs';
import debug from 'debug';

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
    await waitForPeerInfoExchange(1, [msgService]);

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
