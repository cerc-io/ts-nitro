import { Actor } from '../types';

// https://github.com/cerc-io/go-nitro/blob/ts-port-v1.0/scripts/test-configs/alice.toml
export const ALICE_ADDRESS = '0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE';
export const ALICE_PK = '2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d';

// https://github.com/cerc-io/go-nitro/blob/ts-port-v1.0/scripts/test-configs/bob.toml
export const BOB_ADDRESS = '0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94';
export const BOB_PK = '0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4';

export const CHARLIE_ADDRESS = '0x67D5b55604d1aF90074FcB69b8C51838FFF84f8d';
export const CHARLIE_PK = '58368d20ff12f17669c06158c21d885897aa56f9be430edc789614bf9851d53f';

export const DAVID_ADDRESS = '0x111A00868581f73AB42FEEF67D235Ca09ca1E8db';
export const DAVID_PK = 'febb3b74b0b52d0976f6571d555f4ac8b91c308dfa25c7b58d1e6a7c3f50c781';

export const ERIN_ADDRESS = '0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01';
export const ERIN_PK = '0aca28ba64679f63d71e671ab4dbb32aaa212d4789988e6ca47da47601c18fe2';

// First accounts from hardhat chain
export const ALICE_CHAIN_PK = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const BOB_CHAIN_PK = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const CHARLIE_CHAIN_PK = '47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
export const DAVID_CHAIN_PK = '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
export const ERIN_CHAIN_PK = '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

export const ACTORS: { [key: string]: Actor } = {
  alice: {
    address: ALICE_ADDRESS,
    privateKey: ALICE_PK,
    chainPrivateKey: ALICE_CHAIN_PK,
  },
  bob: {
    address: BOB_ADDRESS,
    privateKey: BOB_PK,
    chainPrivateKey: BOB_CHAIN_PK,
  },
  charlie: {
    address: CHARLIE_ADDRESS,
    privateKey: CHARLIE_PK,
    chainPrivateKey: CHARLIE_CHAIN_PK,
  },
  david: {
    address: DAVID_ADDRESS,
    privateKey: DAVID_PK,
    chainPrivateKey: DAVID_CHAIN_PK,
  },
  erin: {
    address: ERIN_ADDRESS,
    privateKey: ERIN_PK,
    chainPrivateKey: ERIN_CHAIN_PK,
  },
};
