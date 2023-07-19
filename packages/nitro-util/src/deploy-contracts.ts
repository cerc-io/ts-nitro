import { ContractFactory, providers } from 'ethers';

import nitroAdjudicatorArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/NitroAdjudicator.sol/NitroAdjudicator.json';
import consensusAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/ConsensusApp.sol/ConsensusApp.json';
import virtualPaymentAppArtifact from '@statechannels/nitro-protocol/dist/artifacts/contracts/VirtualPaymentApp.sol/VirtualPaymentApp.json';

export async function deployContracts(signer: providers.JsonRpcSigner): Promise<[string, string, string]> {
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
