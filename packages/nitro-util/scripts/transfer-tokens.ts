import yargs from 'yargs';
import debug from 'debug';
import { Wallet, providers } from 'ethers';

import { DEFAULT_CHAIN_URL, Token__factory } from '../src';

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
  token: {
    alias: 't',
    type: 'string',
    describe: 'Token address',
    require: true,
  },
  key: {
    alias: 'k',
    type: 'string',
    describe: 'Private key of account to transfer from',
    require: true,
  },
  to: {
    type: 'string',
    describe: 'Account address to transfer to',
    require: true,
  },
  amount: {
    alias: 'a',
    type: 'string',
    describe: 'Amount to transfer',
    require: true,
  },
}).argv;

async function main() {
  const argv = getArgv();

  const provider = new providers.JsonRpcProvider(argv.chainUrl);
  const signer = new Wallet(argv.key, provider);
  const from = await signer.getAddress();

  const testToken = Token__factory.connect(argv.token, signer);
  const tx = await testToken.transfer(argv.to, argv.amount);
  await tx.wait();

  log(`Transferred ${argv.amount} tokens from ${from} to ${argv.to}`);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });
