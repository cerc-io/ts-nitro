import { ContractFactory, Signer } from 'ethers';

export async function deployToken(signer: Signer, artifact: any): Promise<string> {
  const tokenFactory = new ContractFactory(
    artifact.abi,
    artifact.bytecode,
  ).connect(signer);

  const owner = await signer.getAddress();
  const token = await tokenFactory.deploy(owner);

  return token.address;
}
