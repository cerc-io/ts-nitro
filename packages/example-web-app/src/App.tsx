import React, { useEffect, useState } from 'react';
import assert from 'assert';

import { test } from '@cerc-io/nitro-client';
import {
  ACTORS,
  DEFAULT_CHAIN_URL,
  Nitro
} from '@cerc-io/util';

import logo from './logo.svg';
import './App.css';

declare global {
  interface Window {
    nitro?: Nitro
    setupClient: (name: string) => Promise<void>
    clearClientStorage: () => Promise<void>
  }
}

window.clearClientStorage = Nitro.clearClientStorage;

// Method to setup nitro client with test actors
window.setupClient = async (name: string) => {
  const actor = ACTORS[name];
  assert(actor, `Actor with name ${name} does not exists`);
  assert(process.env.REACT_APP_RELAY_MULTIADDR);

  window.nitro = await Nitro.setupClient(
    actor.privateKey,
    DEFAULT_CHAIN_URL,
    actor.chainPrivateKey,
    process.env.REACT_APP_RELAY_MULTIADDR,
    `${name}-db`
  );
};

function App () {
  const [data, setData] = useState('');

  useEffect(() => {
    const res = test();
    setData(res);
  }, []);

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
