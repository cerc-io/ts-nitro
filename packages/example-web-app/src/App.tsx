import React, { useEffect } from 'react';
import assert from 'assert';

import {
  ACTORS,
  DEFAULT_CHAIN_URL,
  Nitro
} from '@cerc-io/util';

import logo from './logo.svg';
import './App.css';

declare global {
  interface Window {
    setupClient: (name: string) => Promise<Nitro>
    clearClientStorage: () => Promise<boolean>
  }
}

window.clearClientStorage = Nitro.clearClientStorage;

// Method to setup nitro client with test actors
window.setupClient = async (name: string): Promise<Nitro> => {
  const actor = ACTORS[name];
  assert(actor, `Actor with name ${name} does not exists`);
  assert(process.env.REACT_APP_RELAY_MULTIADDR);

  return Nitro.setupClient(
    actor.privateKey,
    DEFAULT_CHAIN_URL,
    actor.chainPrivateKey,
    process.env.REACT_APP_RELAY_MULTIADDR,
    `${name}-db`
  );
};

function App () {
  useEffect(() => {
    window.onunhandledrejection = (err) => {
      // Log unhandled errors instead of stopping application
      console.log(err);
    }
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
