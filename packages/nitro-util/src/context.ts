import type { ReadWriteChannel } from '@cerc-io/ts-channel';
import Channel from '@cerc-io/ts-channel';

export class Context {
  ctx: AbortController;

  done: ReadWriteChannel<unknown>;

  constructor() {
    this.ctx = new AbortController();
    this.done = Channel();

    this.ctx.signal.addEventListener('abort', () => {
      this.done.close();
    });
  }

  withCancel(): () => void {
    return () => {
      this.ctx.abort();
    };
  }
}
