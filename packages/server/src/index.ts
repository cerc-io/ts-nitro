import yargs from 'yargs';
import debug from 'debug';

import { setupClient, createOutcome, waitForPeerInfoExchange } from './utils/index';
import { DirectFundParams } from './types';

const log = debug('ts-nitro:server');

const DEFAULT_CHAIN_URL = 'http://127.0.0.1:8545';

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

  const [client, msgService] = await setupClient(argv.port, argv.pk, argv.chainpk, argv.chainurl);
  log('Started P2PMessageService');

  if (argv.directFund) {
    await waitForPeerInfoExchange(1, [msgService]);

    const counterParty = argv.directFund;
    const asset = `0x${'00'.repeat(20)}`;
    const params: DirectFundParams = {
      CounterParty: counterParty,
      ChallengeDuration: 0,
      Outcome: createOutcome(
        asset,
        client.address,
        counterParty,
        1_000_000,
      ),
      AppDefinition: asset,
      AppData: '0x00',
      Nonce: Date.now(),
    };

    await client.createLedgerChannel(
      params.CounterParty,
      params.ChallengeDuration,
      params.Outcome,
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
