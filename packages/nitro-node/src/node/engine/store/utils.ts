import debug from 'debug';
import path from 'path-browserify';

import { NitroSigner } from '@cerc-io/nitro-util';

import { Store } from './store';
import { DurableStore } from './durablestore';
import { MemStore } from './memstore';

const log = debug('ts-nitro:store');

// In go-nitro newStore method is placed in node/engine/store/store.go
// In ts-nitro it cannot be placed in same path as dependency cycle is detected (import/no-cycle)
export async function newStore(signer: NitroSigner, durableStoreFolder?: string): Promise<Store> {
  let ourStore: Store;
  await signer.init();

  if (durableStoreFolder) {
    const me = await signer.getAddress();
    const dataFolder = path.join(durableStoreFolder, me);

    log(JSON.stringify({
      msg: 'Initialising durable store...',
      dataFolder,
    }));

    ourStore = await DurableStore.newDurableStore(signer, dataFolder);
  } else {
    log(JSON.stringify({
      msg: 'Initialising mem store...',
    }));

    ourStore = await MemStore.newMemStore(signer);
  }

  return ourStore;
}
