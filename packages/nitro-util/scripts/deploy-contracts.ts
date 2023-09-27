import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import debug from 'debug';
import { ethers, providers } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src/constants';
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
  key: {
    alias: 'k',
    type: 'string',
    describe: 'Private key of deployer account',
  },
}).argv;

async function main() {
  const argv = getArgv();

  const provider = new providers.JsonRpcProvider(argv.chainurl);
  const signer = argv.key ? new ethers.Wallet(argv.key, provider) : provider.getSigner();

  const [
    nitroAdjudicatorAddress,
    virtualPaymentAppAddress,
    consensusAppAddress,
  ] = await deployContracts(signer);

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
