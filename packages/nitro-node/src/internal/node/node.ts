import debug from 'debug';

// @ts-expect-error
import type { Peer } from '@cerc-io/peer';
import { NitroSigner } from '@cerc-io/nitro-util';

import { EthChainService } from '../../node/engine/chainservice/eth-chainservice';
import { P2PMessageService } from '../../node/engine/messageservice/p2p-message-service/service';
import { newStore } from '../../node/engine/store/utils';
import { setupNode } from '../../utils/helpers';
import { MetricsApi } from '../../node/engine/metrics';
import { Store } from '../../node/engine/store/store';
import { Node } from '../../node/node';
import { initializeEthChainService, ChainOpts } from '../chain/chain';

const log = debug('ts-nitro:node');

export async function initializeNode(
  signer: NitroSigner,
  peer: Peer,
  chainOpts: ChainOpts,
  durableStoreFolder?: string,
  metricsApi?: MetricsApi,
): Promise<[Node, Store, P2PMessageService, EthChainService]> {
  const ourStore = await newStore(signer, durableStoreFolder);

  log('Initializing message service...');
  const msgService = await P2PMessageService.newMessageService(ourStore.getAddress(), peer);

  const ourChain = await initializeEthChainService(chainOpts);

  const node = await setupNode(
    msgService,
    ourStore,
    ourChain,
    metricsApi,
  );

  return [node, ourStore, msgService, ourChain];
}
