import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import debug from 'debug';
import { ContractFactory, providers } from 'ethers';

import nitroAdjudicatorArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/NitroAdjudicator.sol/NitroAdjudicator.json';
import consensusAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/ConsensusApp.sol/ConsensusApp.json';
import virtualPaymentAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/VirtualPaymentApp.sol/VirtualPaymentApp.json';

import { DEFAULT_CHAIN_URL } from '../src/test/constants';

const log = debug('ts-nitro:server');

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
    default: './src/test/addresses.json',
  },
}).argv;

async function deployContracts(signer: providers.JsonRpcSigner): Promise<[string, string, string]> {
  const nitroAdjudicatorFactory = new ContractFactory(
    nitroAdjudicatorArtifact.abi,
    nitroAdjudicatorArtifact.bytecode,
  ).connect(signer);
  const nitroAdjudicator = await nitroAdjudicatorFactory.deploy();

  const virtualPaymentAppFactory = new ContractFactory(
    virtualPaymentAppArtifact.abi,
    virtualPaymentAppArtifact.bytecode,
  ).connect(signer);
  const virtualPaymentApp = await virtualPaymentAppFactory.deploy();

  const consensusAppFactory = new ContractFactory(
    consensusAppArtifact.abi,
    consensusAppArtifact.bytecode,
  ).connect(signer);
  const consensusApp = await consensusAppFactory.deploy();

  return [nitroAdjudicator.address, virtualPaymentApp.address, consensusApp.address];
}

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
  log('Contrats deployed, addresses written to', outputFilePath);
}

main()
  .then(() => {})
  .catch((err) => {
    log(err);
  });

process.on('uncaughtException', (err) => {
  log('uncaughtException', err);
});
