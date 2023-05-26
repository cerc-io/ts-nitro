export { Client } from './client/client';
export { EthChainService } from './client/engine/chainservice/eth-chainservice';
export { MemStore } from './client/engine/store/memstore';
export { PermissivePolicy } from './client/engine/policy-maker';

export const test = (): string => {
  // eslint-disable-next-line no-console
  console.log('Test from nitro-client');

  return 'test output';
};
