import yargs from 'yargs';
import debug from 'debug';
import { BigNumber } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src';
import { getBalanceByAddress, getAddressByKey } from '../src/eth-client';

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
  let balance: BigNumber;
  let address: string;

  if (argv.address) {
    address = argv.address;
    balance = await getBalanceByAddress(argv.address, DEFAULT_CHAIN_URL);
  } else if (argv.key) {
    address = await getAddressByKey(argv.key, DEFAULT_CHAIN_URL);
    balance = await getBalanceByAddress(address, DEFAULT_CHAIN_URL);
  } else {
    throw new Error('Provide either address or private key of an account');
  }
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
