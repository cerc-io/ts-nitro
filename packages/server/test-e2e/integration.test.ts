/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';

import {
  Client, EthChainService, MemStore, PermissivePolicy,
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { expect } from 'chai';
import { createP2PMessageService } from '../src/utils';
import { createOutcome } from './utils';
import { DirectFundParams } from './types';

// Message service port
const MESSAGING_PORT = 3005;

// RPC endpoint for the chain
// Chain should be running locally
const CHAIN_URL = 'http://127.0.0.1:8545';

const ALICE_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ALICE_PK = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const BOB = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('test Client', () => {
  let client: Client;

  it('should instantiate Client', async () => {
    const messageService = await createP2PMessageService(MESSAGING_PORT);

    const chainService = await EthChainService.newEthChainService(
      CHAIN_URL,
      ALICE_PK,
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

    const counterParty = BOB;
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
