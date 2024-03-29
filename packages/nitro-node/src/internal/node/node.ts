import debug from 'debug';

import { EthChainService, ChainOpts } from '../../node/engine/chainservice/eth-chainservice';
import { ChainService } from '../../node/engine/chainservice/chainservice';
import { P2PMessageService, MessageOpts } from '../../node/engine/messageservice/p2p-message-service/service';
import { newStore, StoreOpts } from '../../node/engine/store/utils';
import { setupNode } from '../../utils/helpers';
import { MetricsApi } from '../../node/engine/metrics';
import { Store } from '../../node/engine/store/store';
import { Node } from '../../node/node';

const log = debug('ts-nitro:node');

export async function initializeNode(
  chainOpts: ChainOpts,
  storeOpts: StoreOpts,
  messageOpts: MessageOpts,
  metricsApi?: MetricsApi,
): Promise<[Node, Store, P2PMessageService, ChainService]> {
  const ourStore = await newStore(storeOpts);

  log('Initializing message service...');
  // eslint-disable-next-line no-param-reassign
  messageOpts.scAddr = ourStore.getAddress();
  const msgService = await P2PMessageService.newMessageService(messageOpts);

  // Compare chainOpts.ChainStartBlock to lastBlockNum seen in store. The larger of the two
  // gets passed as an argument when creating NewEthChainService
  const storeBlockNum = await ourStore.getLastBlockNumSeen();

  if (storeBlockNum > chainOpts.chainStartBlock) {
    // eslint-disable-next-line no-param-reassign
    chainOpts.chainStartBlock = storeBlockNum;
  }

  log('Initializing chain service...');

  const ourChain = await EthChainService.newEthChainService(chainOpts);

  const node = await setupNode(
    msgService,
    ourStore,
    ourChain,
    metricsApi,
  );

  return [node, ourStore, msgService, ourChain];
}
