/* eslint-disable @typescript-eslint/no-unused-expressions */
import assert from 'assert';
import { expect } from 'chai';

import { Client, MemStore } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import { setupClient } from '@cerc-io/util';

import { createOutcome, waitForPeerInfoExchange } from '../src/utils/index';
import { DirectFundParams } from '../src/types';
import {
  ALICE_ADDRESS,
  ALICE_MESSAGING_PORT,
  ALICE_PK,
  ALICE_CHAIN_PK,
  BOB_ADDRESS,
  BOB_MESSAGING_PORT,
  BOB_PK,
  BOB_CHAIN_PK,
  CHAIN_URL,
} from './constants';
import { createP2PMessageService } from '../src/utils';
import {
  nitroAdjudicatorAddress,
  virtualPaymentAppAddress,
  consensusAppAddress,
} from './addresses.json';

describe('test Client', () => {
  let aliceClient: Client;
  let bobClient: Client;

  it('should instantiate Clients', async () => {
    const aliceStore = new MemStore(hex2Bytes(ALICE_PK));
    const aliceMsgService = await createP2PMessageService(ALICE_MESSAGING_PORT, aliceStore.getAddress());

    aliceClient = await setupClient(
      aliceMsgService,
      aliceStore,
      {
        chainPk: ALICE_CHAIN_PK,
        chainURL: CHAIN_URL,
        naAddress: nitroAdjudicatorAddress,
        vpaAddress: virtualPaymentAppAddress,
        caAddress: consensusAppAddress,
      },
    );

    expect(aliceClient.address).to.equal(ALICE_ADDRESS);

    const bobStore = new MemStore(hex2Bytes(BOB_PK));
    const bobMsgService = await createP2PMessageService(BOB_MESSAGING_PORT, bobStore.getAddress());

    bobClient = await setupClient(
      bobMsgService,
      bobStore,
      {
        chainPk: BOB_CHAIN_PK,
        chainURL: CHAIN_URL,
        naAddress: nitroAdjudicatorAddress,
        vpaAddress: virtualPaymentAppAddress,
        caAddress: consensusAppAddress,
      },
    );

    expect(bobClient.address).to.equal(BOB_ADDRESS);

    await waitForPeerInfoExchange(1, [aliceMsgService, bobMsgService]);
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
