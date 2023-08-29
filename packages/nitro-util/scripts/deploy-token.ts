import yargs from 'yargs';
import debug from 'debug';
import { providers } from 'ethers';

import { DEFAULT_CHAIN_URL } from '../src';
import { deployToken } from '../src/deploy-contracts';
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
}).argv;

async function main() {
  const argv = getArgv();

  const provider = new providers.JsonRpcProvider(argv.chainurl);
  const tokenAddress = await deployToken(provider.getSigner(), tokenArtifact);

  log('Token deployed to:', tokenAddress);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });
