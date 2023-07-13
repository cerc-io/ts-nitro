import yargs from 'yargs';
import debug from 'debug';
import { Wallet, providers } from 'ethers';

import { utils } from '@cerc-io/nitro-client';

const log = debug('ts-nitro:util');

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  chainurl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: utils.DEFAULT_CHAIN_URL,
  },
  address: {
    alias: 'a',
    type: 'string',
    describe: 'Address of account to check balance for',
  },
  key: {
    alias: 'k',
    type: 'string',
    describe: 'Private key of account to check',
  },
}).argv;

async function main() {
  const argv = getArgv();

  const provider = new providers.JsonRpcProvider(argv.chainurl);
  let address: string;

  if (argv.address) {
    address = argv.address;
  } else if (argv.key) {
    const signer = new Wallet(argv.key, provider);
    address = await signer.getAddress();
  } else {
    throw new Error('Provide either address or private key of an account');
  }

  const balance = await provider.getBalance(address);
  log(`Balance of account ${address} is ${balance.toString()}`);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
