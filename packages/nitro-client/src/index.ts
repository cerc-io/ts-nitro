export const test = (): string => {
  // eslint-disable-next-line no-console
  console.log('Test from nitro-client');

  return 'test output';
};

export { Client } from './client/client';
export { EthChainService } from './client/engine/chainservice/eth-chainservice';
export { P2PMessageService } from './client/engine/messageservice/p2p-message-service/service';
