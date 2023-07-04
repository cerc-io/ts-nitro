import React, { useCallback, useEffect, useState } from 'react';
import assert from 'assert';

import { test, Client, MemStore, P2PMessageService, Store, DurableStore } from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';
import {
  setupClient,
  createOutcome,
  DEFAULT_CHAIN_URL,
  ACTORS
} from '@cerc-io/util';
import { multiaddr } from '@multiformats/multiaddr';

import logo from './logo.svg';
import './App.css';
import { createP2PMessageService } from './utils';

declare global {
  interface Window {
    setupClient: (name: string) => Promise<void>
    client?: Client;
    msgService?: P2PMessageService;
    addPeerByMultiaddr?: (address: string, multiaddrString: string) => Promise<void>
    directFund?: (clientAddress: string) => Promise<void>
    virtualFund?: (clientAddress: string) => Promise<void>
  }
}

function App () {
  const [data, setData] = useState('');
  const [client, setClient] = useState<Client>();
  const [msgService, setMsgService] = useState<P2PMessageService>();

  useEffect(() => {
    const res = test();
    setData(res);
  }, []);

  const init = useCallback(async (pk: string, chainPk: string, indexedDBName?: string) => {
    let store: Store;
    if (indexedDBName) {
      store = DurableStore.newDurableStore(hex2Bytes(pk), indexedDBName);
    } else {
      store = new MemStore(hex2Bytes(pk));
    }

    assert(process.env.REACT_APP_RELAY_MULTIADDR);
    const msgService = await createP2PMessageService(process.env.REACT_APP_RELAY_MULTIADDR, store.getAddress());

    setMsgService(msgService);

    const [client] = await setupClient(
      msgService,
      store,
      {
        chainPk,
        chainURL: DEFAULT_CHAIN_URL
      }
    );

    setClient(client);
  }, []);

  useEffect(() => {
    window.setupClient = async (name: string, useDurableStore = false) => {
      const actor = ACTORS[name];
      assert(actor, `Actor with name ${name} does not exists`);

      await init(actor.privateKey, actor.chainPrivateKey, useDurableStore ? `${name}-db` : undefined);
    };
  }, [init]);

  useEffect(() => {
    if (!msgService) {
      return;
    }

    window.msgService = msgService;

    window.addPeerByMultiaddr = async (address: string, multiaddrString: string) => {
      const multi = multiaddr(multiaddrString);
      await msgService!.addPeerByMultiaddr(address, multi);
    };
  }, [msgService]);

  useEffect(() => {
    if (!client) {
      return;
    }

    window.client = client;
    const challengeDuration = 0;
    const asset = `0x${'00'.repeat(20)}`;

    window.directFund = async (counterParty: string) => {
      const outcome = createOutcome(
        asset,
        window.client!.address,
        counterParty,
        1_000_000
      );

      const response = await client!.createLedgerChannel(
        counterParty,
        challengeDuration,
        outcome
      );

      await client.objectiveCompleteChan(response.id).shift();
      console.log(`Ledger channel created with id ${response.channelId.string()}\n`);
    };

    window.virtualFund = async (counterParty: string) => {
      const intermediaries: string[] = [];
      const outcome = createOutcome(
        asset,
        client.address,
        counterParty,
        1_000
      );

      const response = await client.createVirtualPaymentChannel(
        intermediaries,
        counterParty,
        challengeDuration,
        outcome
      );

      await client.objectiveCompleteChan(response.id).shift();
      console.log(`Virtual payment channel created with id ${response.channelId.string()}\n`);
    };
  }, [client]);

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
