import yargs from 'yargs';
import debug from 'debug';
import { BigNumber, Wallet, providers } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src/constants';

const log = debug('ts-nitro:util');

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  chainurl: {
    alias: 'c',
    type: 'string',
    describe: 'RPC endpoint for the chain',
    default: DEFAULT_CHAIN_URL,
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
  let balance: BigNumber;

  if (argv.address) {
    balance = await provider.getBalance(argv.address);
  } else if (argv.key) {
    const signer = new Wallet(argv.key, provider);
    balance = await signer.getBalance();
  } else {
    throw new Error('Provide either address or private key of account');
  }

  log(`Balance of account ${argv.address} is ${balance.toString()}`);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
