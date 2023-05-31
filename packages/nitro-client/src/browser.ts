export { Client } from './client/client';
export { EthChainService } from './client/engine/chainservice/eth-chainservice';
export { MemStore } from './client/engine/store/memstore';
export { PermissivePolicy } from './client/engine/policy-maker';
export { SingleAssetExit, Exit } from './channel/state/outcome/exit';
export { Allocation, AllocationType, Allocations } from './channel/state/outcome/allocation';
export { Destination } from './types/destination';

export const test = (): string => {
  // eslint-disable-next-line no-console
  console.log('Test from nitro-client');

  return 'test output';
};
