import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import debug from 'debug';
import { providers } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src';
import { deployContracts } from '../src/deploy-contracts';

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
  addressesFilePath: {
    alias: 'f',
    type: 'string',
    describe: 'JSON file path to export addresses to',
    default: './nitro-addresses.json',
  },
}).argv;

async function main() {
  const argv = getArgv();

  const provider = new providers.JsonRpcProvider(argv.chainurl);
  const [
    nitroAdjudicatorAddress,
    virtualPaymentAppAddress,
    consensusAppAddress,
  ] = await deployContracts(provider.getSigner());

  const output = {
    nitroAdjudicatorAddress,
    virtualPaymentAppAddress,
    consensusAppAddress,
  };

  const outputFilePath = path.resolve(argv.addressesFilePath);
  fs.writeFileSync(outputFilePath, JSON.stringify(output, null, 2));
  log('Contracts deployed, addresses written to', outputFilePath);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
