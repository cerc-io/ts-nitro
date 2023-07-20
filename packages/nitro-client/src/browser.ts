export { Client } from './client/client';
export { EthChainService } from './client/engine/chainservice/eth-chainservice';
export { P2PMessageService } from './client/engine/messageservice/p2p-message-service/service';
export { Store } from './client/engine/store/store';
export { MemStore } from './client/engine/store/memstore';
export { DurableStore } from './client/engine/store/durablestore';
export { PermissivePolicy } from './client/engine/policy-maker';
export { SingleAssetExit, Exit } from './channel/state/outcome/exit';
export { Allocation, AllocationType, Allocations } from './channel/state/outcome/allocation';
export { Destination } from './types/destination';
export { Metrics, GetMetrics } from './client/engine/metrics';
export { LedgerChannelInfo, PaymentChannelInfo } from './client/query/types';
export { Voucher } from './payments/vouchers';
export {
  Signature, recoverEthereumMessageSigner, getSignatureFromEthersSignature, signEthereumMessage,
} from './crypto/signatures';

export * as utils from './utils';

export const test = (): string => {
  // eslint-disable-next-line no-console
  console.log('Test from nitro-client');

  return 'test output';
};
