import yargs from 'yargs';
import debug from 'debug';

import { EthChainService } from '@cerc-io/nitro-client';
import { createP2PMessageService } from './utils';

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
  address: {
    alias: 'a',
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Account address for the client',
  },
  chainurl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: 'http://127.0.0.1:8545',
  },
}).argv;

const main = async () => {
  const argv = getArgv();

  const p2pMessageService = await createP2PMessageService(argv.port, argv.address);

  log('p2pMessageService', p2pMessageService.constructor.name);

  // TODO: Pass a pk and contract addresses
  const ethChainService = await EthChainService.newEthChainService(
    argv.chainurl,
    '',
    'naaddress',
    'caAddress',
    'vpaAddress',
  );
  const chainId = await ethChainService.getChainId();

  log('Connected to chain with chain ID: ', chainId.toString());
};

main().then(() => {
  log('Started P2PMessageService');
}).catch((err) => {
  log(err);
});

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
