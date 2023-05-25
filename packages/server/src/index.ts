import yargs from 'yargs';
import debug from 'debug';

import { P2PMessageService, EthChainService } from '@cerc-io/nitro-client';

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
  chainurl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: 'http://127.0.0.1:8545',
  },
}).argv;

const main = async () => {
  const argv = getArgv();

  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  const p2pMessageService = await P2PMessageService.newMessageService(
    '127.0.0.1',
    argv.port,
    // TODO: Pass account address
    '',
    privateKey.bytes,
    true,
  );

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
