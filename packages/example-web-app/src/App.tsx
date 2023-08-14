import React, { useEffect } from 'react';
import assert from 'assert';

import { utils } from '@cerc-io/nitro-node';
import { JSONbigNative, hex2Bytes, DEFAULT_CHAIN_URL } from '@cerc-io/nitro-util';

import contractAddresses from './nitro-addresses.json';
import logo from './logo.svg';
import './App.css';

const {
  ACTORS,
  createPeerIdFromKey,
  createPeerAndInit
} = utils;

declare global {
  interface Window {
    setupNode: (name: string) => Promise<utils.Nitro>
    clearNodeStorage: () => Promise<boolean>
    out: (jsonObject: any) => void
  }
}

window.clearNodeStorage = utils.Nitro.clearNodeStorage;

// Method to setup nitro node with test actors
window.setupNode = async (name: string): Promise<utils.Nitro> => {
  const actor = ACTORS[name];
  assert(actor, `Actor with name ${name} does not exists`);
  assert(process.env.REACT_APP_RELAY_MULTIADDR);

  // Create peer instance
  const peerIdObj = await createPeerIdFromKey(hex2Bytes(actor.privateKey));
  const peer = await createPeerAndInit(process.env.REACT_APP_RELAY_MULTIADDR, {}, peerIdObj);

  return utils.Nitro.setupNode(
    actor.privateKey,
    DEFAULT_CHAIN_URL,
    actor.chainPrivateKey,
    contractAddresses,
    peer,
    `${name}-db`,
    undefined,
    process.env.REACT_APP_ASSET_ADDRESS
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
        <h3>ts-nitro</h3>
      </header>
    </div>
  );
}

export default App;
