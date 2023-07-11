import React, { useEffect } from 'react';
import assert from 'assert';

import {
  ACTORS,
  DEFAULT_CHAIN_URL,
  Nitro,
  createPeerIdFromKey,
  createPeerAndInit
} from '@cerc-io/util';
import { JSONbigNative, hex2Bytes } from '@cerc-io/nitro-util';

import logo from './logo.svg';
import './App.css';

declare global {
  interface Window {
    setupClient: (name: string) => Promise<Nitro>
    clearClientStorage: () => Promise<boolean>
    out: (jsonObject: any) => void
  }
}

window.clearClientStorage = Nitro.clearClientStorage;

// Method to setup nitro client with test actors
window.setupClient = async (name: string): Promise<Nitro> => {
  const actor = ACTORS[name];
  assert(actor, `Actor with name ${name} does not exists`);
  assert(process.env.REACT_APP_RELAY_MULTIADDR);

  // Create peer instance
  const peerIdObj = await createPeerIdFromKey(hex2Bytes(actor.privateKey));
  const peer = await createPeerAndInit(process.env.REACT_APP_RELAY_MULTIADDR, {}, peerIdObj);

  return Nitro.setupClient(
    actor.privateKey,
    DEFAULT_CHAIN_URL,
    actor.chainPrivateKey,
    peer,
    `${name}-db`
  );
};

window.out = (jsonObject) => {
  console.log(JSONbigNative.stringify(jsonObject, null, 2));
};

function App () {
  useEffect(() => {
    window.onunhandledrejection = (err) => {
      // Log unhandled errors instead of stopping application
      console.log(err);
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
      </header>
    </div>
  );
}

export default App;
