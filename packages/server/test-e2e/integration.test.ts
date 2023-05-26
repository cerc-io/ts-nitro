/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import {
  Client, EthChainService, MemStore, PermissivePolicy,
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { createP2PMessageService } from '../src/utils';
import { createOutcome } from './utils';
import { DirectFundParams } from './types';

// Message service port
const MESSAGING_PORT = 3005;

// RPC endpoint for the chain
// Chain should be running locally
const CHAIN_URL = 'http://127.0.0.1:8545';

// https://github.com/cerc-io/go-nitro/blob/ts-port-v1.0/scripts/test-configs/alice.toml
const ALICE_ADDRESS = '0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE';
const ALICE_PK = '2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d';

// First account from hardhat chain
const ALICE_CHAIN_PK = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// https://github.com/cerc-io/go-nitro/blob/ts-port-v1.0/scripts/test-configs/bob.toml
const BOB_ADDRESS = '0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94';

describe('test Client', () => {
  let client: Client;

  it('should instantiate Client', async () => {
    const messageService = await createP2PMessageService(MESSAGING_PORT);

    const chainService = await EthChainService.newEthChainService(
      CHAIN_URL,
      ALICE_CHAIN_PK,
      'naaddress',
      'caAddress',
      'vpaAddress',
    );

    const store = new MemStore(hex2Bytes(ALICE_PK));

    client = await Client.new(
      messageService,
      chainService,
      store,
      undefined,
      new PermissivePolicy(),
    );

    expect(client.address).to.equal(ALICE_ADDRESS);
  });

  it('should create ledger channel', async () => {
    assert(client.address);

    const counterParty = BOB_ADDRESS;
    const asset = `0x${'00'.repeat(20)}`;
    const params: DirectFundParams = {
      CounterParty: counterParty,
      ChallengeDuration: 0,
      Outcome: createOutcome(
        asset,
        client.address,
        counterParty,
        1_000_000,
      ),
      AppDefinition: asset,
      AppData: '0x00',
      Nonce: Date.now(),
    };

    const response = client.createLedgerChannel(
      params.CounterParty,
      params.ChallengeDuration,
      params.Outcome,
    );
    expect(response).to.be.empty;

    // TODO: Implement and close services
    // client.close();
  });
});
