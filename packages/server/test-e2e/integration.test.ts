/* eslint-disable @typescript-eslint/no-unused-expressions */
import { ethers } from 'ethers';

import {
  Client, EthChainService, MemStore, PermissivePolicy,
} from '@cerc-io/nitro-client';

import { expect } from 'chai';
import { createP2PMessageService } from '../src/utils';

// Message service port
const MESSAGING_PORT = 3005;

// RPC endpoint for the chain
// Chain should be running locally
const CHAIN_URL = 'http://127.0.0.1:8545';

describe('test Client', () => {
  let client: Client;

  it('should instantiate Client', async () => {
    const messageService = await createP2PMessageService(MESSAGING_PORT);

    const chainService = await EthChainService.newEthChainService(
      CHAIN_URL,
      '',
      'naaddress',
      'caAddress',
      'vpaAddress',
    );

    // TODO: Pass actor private key
    const store = new MemStore(Buffer.from('key'));

    client = await Client.new(
      messageService,
      chainService,
      store,
      undefined,
      new PermissivePolicy(),
    );

    expect(client.address).to.equal(ethers.constants.AddressZero);
  });

  it('should create ledger channel', async () => {
    const response = client.createLedgerChannel('', 0, []);
    expect(response).to.be.empty;

    // TODO: Implement and close services
    // client.close();
  });
});
