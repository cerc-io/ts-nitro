import debug from 'debug';
import path from 'path-browserify';

import { NitroSigner } from '@cerc-io/nitro-util';

import { Store } from './store';
import { DurableStore } from './durablestore';
import { MemStore } from './memstore';

const log = debug('ts-nitro:store');

export interface StoreOpts {
  signer: NitroSigner,
  durableStoreFolder?: string
}
// In go-nitro newStore method is placed in node/engine/store/store.go
// In ts-nitro it cannot be placed in same path as dependency cycle is detected (import/no-cycle)
export async function newStore(options: StoreOpts): Promise<Store> {
  let ourStore: Store;
  await options.signer.init();

  if (options.durableStoreFolder) {
    const me = await options.signer.getAddress();
    const dataFolder = path.join(options.durableStoreFolder, me);

    log(JSON.stringify({
      msg: 'Initialising durable store...',
      dataFolder,
    }));

    ourStore = await DurableStore.newDurableStore(options.signer, dataFolder);
  } else {
    log(JSON.stringify({
      msg: 'Initialising mem store...',
    }));

    ourStore = await MemStore.newMemStore(options.signer);
  }

  return ourStore;
}
