import Channel from '@cerc-io/ts-channel';
import type { ReadWriteChannel } from '@cerc-io/ts-channel';

// https://pkg.go.dev/time#Ticker
export class Ticker {
  c?: ReadWriteChannel<Date>;

  intervalId?: NodeJS.Timeout;

  constructor(d: number) {
    this.c = Channel<Date>(1);

    this.intervalId = setInterval(async () => {
      await this.c!.push(new Date());
    }, d);
  }

  static async newTicker(d: number): Promise<Ticker> {
    if (d <= 0) {
      throw new Error('non-positive interval for NewTicker');
    }

    const t = new Ticker(d);
    return t;
  }

  stop(): void {
    clearInterval(this.intervalId!);
  }
}
