import React, { useEffect, useState } from 'react';

import { test, P2PMessageService } from '@cerc-io/nitro-client';

import logo from './logo.svg';
import './App.css';

function App() {
  const [data, setData] = useState('')

  useEffect(() => {
    const res = test();
    const p2pMessageService = P2PMessageService.newMessageService();
    console.log('p2pMessageService', p2pMessageService);
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
