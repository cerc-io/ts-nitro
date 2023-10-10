import debug from 'debug';
import {
  BytesLike, ContractFactory, ContractInterface, Signer, ethers, providers,
} from 'ethers';

import nitroAdjudicatorArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/NitroAdjudicator.sol/NitroAdjudicator.json';
import consensusAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/ConsensusApp.sol/ConsensusApp.json';
import virtualPaymentAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/VirtualPaymentApp.sol/VirtualPaymentApp.json';

const log = debug('ts-nitro:chain');

// deployContract deploys a contract and waits for the transaction to be mined.
async function deployContract(name: string, signer: Signer, contractInterface: ContractInterface, bytecode: BytesLike): Promise<string> {
  const contractFactory = new ContractFactory(contractInterface, bytecode).connect(signer);

  const contract = await contractFactory.deploy();
  log(`Waiting for ${name} deployment confirmation`);

  await contract.deployTransaction.wait();
  log(`${name} successfully deployed to ${contract.address}`);

  return contract.address;
}

// DeployContracts deploys the NitroAdjudicator, VirtualPaymentApp and ConsensusApp contracts.
export async function deployContracts(chainURL: string, chainPK?: string): Promise<[string, string, string]> {
  const provider = new providers.JsonRpcProvider(chainURL);
  const signer = chainPK ? new ethers.Wallet(chainPK, provider) : provider.getSigner();

  const na = await deployContract('NitroAdjudicator', signer, nitroAdjudicatorArtifact.abi, nitroAdjudicatorArtifact.bytecode);

  const vpa = await deployContract('VirtualPaymentApp', signer, virtualPaymentAppArtifact.abi, virtualPaymentAppArtifact.bytecode);

  const ca = await deployContract('ConsensusApp', signer, consensusAppArtifact.abi, consensusAppArtifact.bytecode);

  return [na, vpa, ca];
}
