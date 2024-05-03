import { useEffect, useState } from 'react';
import {
  utils,
  LedgerChannelInfo,
  PaymentChannelInfo
} from '@cerc-io/nitro-node';
import {
  JSONbigNative,
  hex2Bytes
} from '@cerc-io/nitro-util';

import './App.css';

const { createPeerIdFromKey, createPeerAndInit, subscribeVoucherLogs } = utils;

const setupNode = async (
  websocketUrl: string,
  privateKey: string,
  bootNodeMultiAddr: string,
  contractAddresses: { [key: string]: string }
): Promise<utils.Nitro> => {
  // Create peer instance
  const peerIdObj = await createPeerIdFromKey(hex2Bytes(privateKey));
  const peer = await createPeerAndInit(bootNodeMultiAddr, {}, peerIdObj);

  const nitro = await utils.Nitro.setupNode(
    privateKey,
    websocketUrl,
    privateKey,
    contractAddresses,
    peer,
    true,
    'nitro-db'
  );

  // Subscribe to vouchers and log them
  subscribeVoucherLogs(nitro.node);

  return nitro;
};

async function updateChannels (
  nitro: utils.Nitro,
  setFocusedLedgerChannel: (l: LedgerChannelInfo | null) => void,
  setFocusedPaymentChannel: (p: PaymentChannelInfo | null) => void,
  setCreatingLedgerChannel: (v: boolean) => void,
  setCreatingPaymentChannel: (v: boolean) => void
) {
  if (!nitro) {
    return;
  }
  const ledgerChannels = (await nitro.getAllLedgerChannels()).filter(
    (lc) => lc.status === 'Open'
  );
  const paymentChannels = new Map<string, PaymentChannelInfo[]>();

  let focusedLedgerChannel: LedgerChannelInfo | null = null;
  let focusedPaymentChannel: PaymentChannelInfo | null = null;

  for (const lc of ledgerChannels) {
    const pcs = (await nitro.getPaymentChannelsByLedger(lc.iD.string())).filter(
      (pc) => pc.status === 'Open'
    );
    paymentChannels.set(lc.iD.string(), pcs);
    for (const pc of pcs) {
      if (
        focusedPaymentChannel == null ||
          pc.balance.remainingFunds!.valueOf() >
          focusedPaymentChannel.balance.remainingFunds!.valueOf()
      ) {
        focusedLedgerChannel = lc;
        focusedPaymentChannel = pc;
      }
    }
  }

  if (!focusedLedgerChannel && ledgerChannels.length) {
    focusedLedgerChannel = ledgerChannels[0];
  }

  setFocusedPaymentChannel(focusedPaymentChannel);
  if (focusedPaymentChannel) {
    setCreatingPaymentChannel(false);
  }
  setFocusedLedgerChannel(focusedLedgerChannel);
  if (focusedLedgerChannel) {
    setCreatingLedgerChannel(false);
  }
}

async function pay (
  nitro: utils.Nitro | null,
  targetUrl: string,
  paymentChannel: PaymentChannelInfo | null,
  amount: number,
  setToken: (p: any | null) => void
) {
  if (nitro && paymentChannel) {
    const voucher = await nitro.pay(paymentChannel.iD.string(), `${amount}`);
    const response = await fetch(`${targetUrl}/pay/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSONbigNative.stringify(voucher)
    });
    const token = await response.json();
    setToken(token);
  }
}

function getRpcUrl (rpcUrl?: string): string {
  if (rpcUrl) {
    return rpcUrl ?? '';
  }
  return process.env.REACT_APP_RPC_URL ?? 'ws://localhost:8546';
}

function getTargetUrl (targetUrl?: string): string {
  if (targetUrl) {
    return targetUrl ?? '';
  }

  return process.env.REACT_APP_TARGET_URL ?? 'http://localhost:5678';
}

async function send (url: string): Promise<any> {
  try {
    const fromEl = document.getElementById('api-send');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // @ts-ignore
      body: fromEl!.value
    });

    const text = await response.text();
    const recvEl = document.getElementById('api-recv');
    // @ts-ignore
    recvEl.value = text;
  } catch (e) {
    const recvEl = document.getElementById('api-recv');
    // @ts-ignore
    recvEl.value = e;
  }
}

function App () {
  const [nitro, setNitro] = useState<utils.Nitro | null>(null);
  const [targetServerUrl, setTargetServerUrl] = useState<string>(
    getTargetUrl()
  );
  const [myEthWebSocketUrl, setMyEthWebSocketUrl] = useState<string>(getRpcUrl());
  const [myNitroAddress, setMyNitroAddress] = useState<string>('');
  const [theirNitroAddress, setTheirNitroAddress] = useState<string>('');
  const [targetMultiAddr, setTargetMultiAddr] = useState<string>('');
  const [focusedLedgerChannel, setFocusedLedgerChannel] =
    useState<LedgerChannelInfo | null>(null);
  const [focusedPaymentChannel, setFocusedPaymentChannel] =
    useState<PaymentChannelInfo | null>(null);
  const [token, setToken] = useState<any>(null);
  const [creatingLedgerChannel, setCreatingLedgerChannel] =
    useState<boolean>(false);
  const [creatingPaymentChannel, setCreatingPaymentChannel] =
    useState<boolean>(false);

  let updateEverything = async () => {};
  let updateInterval: NodeJS.Timeout | undefined;

  const rpcChange = async () => {
    if (!myEthWebSocketUrl || !targetMultiAddr) {
      return;
    }
    setFocusedPaymentChannel(null);
    setFocusedLedgerChannel(null);
    setMyNitroAddress('');
    const c = await setupNode(myEthWebSocketUrl,
        process.env.REACT_APP_NITRO_PK!,
        targetMultiAddr,
        {
          nitroAdjudicatorAddress: process.env.REACT_APP_NA_ADDRESS!,
          virtualPaymentAppAddress: process.env.REACT_APP_VPA_ADDRESS!,
          consensusAppAddress: process.env.REACT_APP_CA_ADDRESS!
        });
    setNitro(c);
    setMyNitroAddress(c.node.address);
    updateEverything = async () =>
      updateChannels(
        c,
        setFocusedLedgerChannel,
        setFocusedPaymentChannel,
        setCreatingLedgerChannel,
        setCreatingPaymentChannel
      );
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(updateEverything, 1000);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(rpcChange, 1000);
    return () => clearTimeout(delayDebounceFn);
  }, [myEthWebSocketUrl]);

  useEffect(() => {
    if (nitro) {
      setMyNitroAddress(nitro.store.getAddress());
      nitro.addPeerByMultiaddr(theirNitroAddress, targetMultiAddr);
      updateEverything();
      // nitro.notifications.on('objective_completed', updateEverything);
    }
  }, [nitro, targetMultiAddr, theirNitroAddress]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setFocusedPaymentChannel(null);
      setFocusedLedgerChannel(null);
      setTheirNitroAddress('');
      fetch(targetServerUrl + '/pay/address').then((response) => {
        response.json().then((v: any) => {
          setTheirNitroAddress(v?.address);
          setTargetMultiAddr(v?.multiaddrs[0]);
          rpcChange();
          if (nitro) {
            updateEverything();
          }
        });
      });
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [targetServerUrl, targetMultiAddr]);

  return (
    <>
      <div id="top-group">
        <h2>Nitro Details</h2>
        <table>
          <tbody>
          <tr>
            <td className="key">ETH WebSocket URL</td>
            <td className="value">
              <input
                  type="text"
                  onChange={(e) => setMyEthWebSocketUrl(e.target.value)}
                  value={myEthWebSocketUrl?.toString()}
              />
            </td>
          </tr>
          <tr>
            <td className="key">Consumer Address</td>
            <td className="value">{myNitroAddress}</td>
          </tr>
          <tr>
            <td className="key">Provider Endpoint</td>
            <td className="value">
              <input
                  type="text"
                  onChange={(e) => setTargetServerUrl(e.target.value)}
                  value={targetServerUrl?.toString()}
              />
            </td>
          </tr>
          <tr>
            <td className="key">Provider Address</td>
            <td className="value">{theirNitroAddress}</td>
          </tr>
          <tr>
            <td className="key">Provider MultiAddr</td>
            <td className="value">{targetMultiAddr}</td>
          </tr>
          <tr>
            <td className="key">Ledger Channel</td>
            <td className="value">
              {focusedLedgerChannel
                ? (
                      <span>
                    {focusedLedgerChannel.iD.string()}{' '}
                        <button
                            onClick={() =>
                                nitro!.directDefund(focusedLedgerChannel.iD.string())
                            }
                        >
                      Close
                    </button>
                  </span>
                  )
                : (
                      <button
                          onClick={() => {
                            setCreatingLedgerChannel(true);
                            nitro!.directFund(theirNitroAddress, '100000');
                          }}
                          disabled={
                              creatingLedgerChannel || !myNitroAddress || !theirNitroAddress
                          }
                      >
                        {creatingLedgerChannel ? 'Please wait ...' : 'Create'}
                      </button>
                  )}
            </td>
          </tr>
          <tr>
            <td className="key">Ledger Balance</td>
            <td className="value">
              {focusedLedgerChannel
                ? `${focusedLedgerChannel.balance.theirBalance} / ${focusedLedgerChannel.balance.myBalance}`
                : ''}
            </td>
          </tr>
          <tr>
            <td className="key">Payment Channel</td>
            <td className="value">
              {focusedPaymentChannel
                ? (
                      <span>
                    {focusedPaymentChannel.iD.string()}{' '}
                        <button
                            onClick={() =>
                                nitro!.virtualDefund(focusedPaymentChannel.iD.string())
                            }
                        >
                      Close
                    </button>
                  </span>
                  )
                : focusedLedgerChannel
                  ? (
                          <button
                              onClick={() => {
                                setCreatingPaymentChannel(true);
                                nitro!.virtualFund(theirNitroAddress, '100');
                              }}
                              disabled={creatingLedgerChannel || !focusedLedgerChannel}
                          >
                            {creatingPaymentChannel || creatingLedgerChannel
                              ? 'Please wait ...'
                              : 'Create'}
                          </button>
                    )
                  : (
                      ''
                    )}
            </td>
          </tr>
          <tr>
            <td className="key">Channel Balance</td>
            <td className="value">
              {focusedPaymentChannel
                ? `${focusedPaymentChannel.balance.paidSoFar} / ${focusedPaymentChannel.balance.remainingFunds}`
                : ''}
            </td>
          </tr>
          <tr>
            <td className="key">API Token</td>
            <td className="value">
              {token && `${token.token}`}{' '}
              {focusedPaymentChannel && (
                  <button
                      className={
                        token &&
                        (token.used >= token.total ||
                            focusedPaymentChannel?.balance?.remainingFunds?.toString() === '0')
                          ? 'empty'
                          : ''
                      }
                      onClick={() => {
                        pay(
                          nitro,
                          targetServerUrl,
                          focusedPaymentChannel,
                          10,
                          setToken
                        ).then(() => updateEverything());
                      }}
                      disabled={
                          focusedPaymentChannel?.balance?.remainingFunds?.toString() === '0'
                      }
                  >
                    {token ? `Renew (${token.total - token.used})` : 'Obtain'}
                  </button>
              )}
            </td>
          </tr>
          </tbody>
        </table>
      </div>
      <div id="mid-group">
        <h2>Ethereum API</h2>
        <table width="100%">
          <tbody>
          <tr>
              <td>
                <textarea
                  id="api-send"
                  defaultValue={JSONbigNative.stringify(
                    {
                      jsonrpc: '2.0',
                      id: 42,
                      method: 'eth_blockNumber',
                      params: []
                    },
                    undefined,
                    2
                  )}
                />
              </td>
              <td>
                <textarea id="api-recv" contentEditable={false}></textarea>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <button
                  onClick={() => {
                    send(`${targetServerUrl}/eth/${token ? token.token : ''}`);
                    if (token?.used < token?.total) {
                      token.used += 1;
                      setToken({ ...token });
                    }
                  }}
                >
                  Send Request
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export default App;
