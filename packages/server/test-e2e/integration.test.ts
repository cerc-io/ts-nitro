/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import { Client } from '@cerc-io/nitro-client';

import { createOutcome } from './utils';
import { DirectFundParams } from './types';
import { setupClient } from './helpers';
import {
  ALICE_ADDRESS,
  ALICE_MESSAGING_PORT,
  ALICE_PK,
  ALICE_CHAIN_PK,
  BOB_ADDRESS,
  BOB_MESSAGING_PORT,
  BOB_PK,
  BOB_CHAIN_PK,
} from './constants';

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;

  it('should instantiate Clients', async () => {
    aliceClient = await setupClient(ALICE_MESSAGING_PORT, ALICE_PK, ALICE_CHAIN_PK);
    expect(aliceClient.address).to.equal(ALICE_ADDRESS);

    bobClient = await setupClient(BOB_MESSAGING_PORT, BOB_PK, BOB_CHAIN_PK);
    expect(bobClient.address).to.equal(BOB_ADDRESS);
  });

  it('should create ledger channel', async () => {
    assert(aliceClient.address);

    const counterParty = BOB_ADDRESS;
    const asset = `0x${'00'.repeat(20)}`;
    const params: DirectFundParams = {
      CounterParty: counterParty,
      ChallengeDuration: 0,
      Outcome: createOutcome(
        asset,
        aliceClient.address,
        counterParty,
        1_000_000,
      ),
      AppDefinition: asset,
      AppData: '0x00',
      Nonce: Date.now(),
    };

    const response = await aliceClient.createLedgerChannel(
      params.CounterParty,
      params.ChallengeDuration,
      params.Outcome,
    );

    expect(response).to.have.property('id');
    expect(response).to.have.property('channelId');

    // Check that channelId value is present as a substring in id
    expect(response.id).to.contain(response.channelId.value);

    // TODO: Implement and close services
    // client.close();
  });
});
