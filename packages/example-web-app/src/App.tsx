import React, { useCallback, useEffect, useState } from 'react';
import assert from 'assert';

import { test, Client, MemStore, P2PMessageService } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import {
  setupClient,
  createOutcome,
  ALICE_PK,
  ALICE_CHAIN_PK,
  BOB_PK,
  BOB_CHAIN_PK,
} from '@cerc-io/util';

import logo from './logo.svg';
import './App.css';
import { createP2PMessageService } from './utils';

declare global {
  interface Window {
    client: Client;
    msgService: P2PMessageService;
    setupClient: (name: string) => Promise<void>
    directFund: (clientAddress: string) => Promise<void>
  }
}

function App() {
  const [data, setData] = useState('');

  useEffect(() => {
    const res = test();
    setData(res);
  }, []);

  const init = useCallback(async (pk: string, chainPk: string) => {
    const store = new MemStore(hex2Bytes(pk));
    assert(process.env.REACT_APP_RELAY_MULTIADDR);
    window.msgService = await createP2PMessageService(process.env.REACT_APP_RELAY_MULTIADDR, store.getAddress());

    window.client = await setupClient(
      window.msgService,
      store,
      {
        chainPk
      }
    );

    window.directFund = async (clientAddress: string) => {
      const counterParty = clientAddress;
      const challengeDuration = 0;
      const asset = `0x${'00'.repeat(20)}`;

      const outcome = createOutcome(
        asset,
        window.client.address,
        counterParty,
        1_000_000,
      )
      
      const response = await window.client.createLedgerChannel(
        counterParty,
        challengeDuration,
        outcome,
      );

      console.log(response)
    }
  }, []);

  // TODO: Call direct-fund

  useEffect(() => {
    window.setupClient = async (name: string) => {
      if (name === 'alice') {
        await init(ALICE_PK, ALICE_CHAIN_PK);
        return;
      }

      await init(BOB_PK, BOB_CHAIN_PK);
    }
  }, [init])

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>{data}</p>
      </header>
    </div>
  );
}

export default App;
