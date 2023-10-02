import yargs from 'yargs';
import debug from 'debug';
import { ethers, providers } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src';
import { deployToken } from '../src/deploy-token';
import tokenArtifact from '../contracts/Token.json';

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

  const tokenAddress = await deployToken(signer, tokenArtifact);

  log('Token deployed to:', tokenAddress);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });
