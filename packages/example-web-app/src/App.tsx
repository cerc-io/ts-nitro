import React, { useCallback, useEffect, useState } from 'react';
import assert from 'assert';

import { test, Client, MemStore, P2PMessageService } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import { setupClient } from '@cerc-io/util';

import logo from './logo.svg';
import './App.css';
import { ALICE_CHAIN_PK, ALICE_PK, BOB_CHAIN_PK, BOB_PK, CA_ADDRESS, CHAIN_URL, NA_ADDRESS, VPA_ADDRESS } from './constants';
import { createP2PMessageService } from './utils';

declare global {
  interface Window {
    client: Client;
    msgService: P2PMessageService;
    setupClient: (name: string) => Promise<void>
  }
}

function App() {
  const [data, setData] = useState('')

  useEffect(() => {
    const res = test();
    setData(res);
  }, []);

  const init = useCallback(async (pk: string, chainPk: string) => {
    const store = new MemStore(hex2Bytes(pk));
    assert(process.env.REACT_APP_RELAY_MULTIADDR);
    const msgService = await createP2PMessageService(process.env.REACT_APP_RELAY_MULTIADDR, store.getAddress());
  
    const client = await setupClient(
      msgService,
      store,
      {
        chainPk,
        caAddress: CA_ADDRESS,
        chainURL: CHAIN_URL,
        naAddress: NA_ADDRESS,
        vpaAddress: VPA_ADDRESS

      }
    );
  }, []);

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
