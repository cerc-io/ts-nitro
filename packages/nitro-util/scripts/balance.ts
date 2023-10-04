import yargs from 'yargs';
import debug from 'debug';
import { providers, BigNumber } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src';
import { getBalanceByAddress, getAddressByKey } from '../src/misc';
import { Token__factory } from '../src/contract-bindings/factories/Token__factory';

const log = debug('ts-nitro:util');

const getArgv = () => yargs.parserConfiguration({
  'parse-numbers': false,
}).options({
  chainUrl: {
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
  token: {
    alias: 't',
    type: 'string',
    describe: 'Token address',
  },
}).argv;

export async function getTokenBalanceByAddress(token: string, address: string, chainURL: string): Promise<BigNumber> {
  const provider = new providers.JsonRpcProvider(chainURL);
  const tokenFactory = Token__factory.connect(token, provider.getSigner());

  return tokenFactory.balanceOf(address);
}

async function main() {
  const argv = getArgv();
  let address: string;

  if (argv.address) {
    address = argv.address;
  } else if (argv.key) {
    address = await getAddressByKey(argv.key, argv.chainUrl);
  } else {
    throw new Error('Provide either address or private key of an account');
  }

  if (argv.token) {
    const balance = await getTokenBalanceByAddress(argv.token, address, argv.chainUrl);
    log(`Token balance of account ${address} is ${balance.toString()}`);
  } else {
    const balance = await getBalanceByAddress(address, argv.chainUrl);
    log(`ETH balance of account ${address} is ${balance.toString()}`);
  }
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
