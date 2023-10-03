import assert from 'assert';
import { Mutex } from 'async-mutex';
import { ethers } from 'ethers';
import Heap from 'heap';
import type { Log } from '@ethersproject/abstract-provider';

import { Uint64 } from '@cerc-io/nitro-util';

export class EventTracker {
  latestBlockNum?: bigint;

  events?: Heap<ethers.providers.Log>;

  mu: Mutex = new Mutex();

  constructor(params: {
    latestBlockNum: bigint;
    events: Heap<ethers.providers.Log>;
    mu?: Mutex;
  }) {
    Object.assign(this, params);
  }

  static newEventTracker(startBlock: Uint64): EventTracker {
    // Implement Min-Heap
    // https://pkg.go.dev/container/heap
    // https://github.com/qiao/heap.js#constructor-heapcmp
    const eventQueue = new Heap((log1: Log, log2: Log) => {
      return log1.blockNumber - log2.blockNumber;
    });

    const eventTracker = new EventTracker({ latestBlockNum: startBlock, events: eventQueue });

    return eventTracker;
  }

  push(l: Log) {
    assert(this.events);
    this.events.push(l);
  }

  pop(): Log {
    assert(this.events);
    return this.events.pop()!;
  }
}
