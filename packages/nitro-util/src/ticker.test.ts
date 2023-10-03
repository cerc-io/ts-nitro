import 'mocha';
import { expect } from 'chai';
import Channel from '@cerc-io/ts-channel';

import { Ticker } from './ticker';

const TICKER_DURATION = 1000;
const TEST_DURATION = 10000;
const EXPECTED_TICK_COUNT = TEST_DURATION / TICKER_DURATION;

describe('Test Ticker', () => {
  it('Test ticker count', async () => {
    const ticker = await Ticker.newTicker(TICKER_DURATION);
    let tickerCount = 0;

    const completeChannel = Channel<boolean>();

    setTimeout(() => {
      completeChannel.push(true);
    }, TEST_DURATION);

    while (true) {
      // eslint-disable-next-line default-case, no-await-in-loop
      switch (await Channel.select([
        completeChannel.shift(),
        ticker.c!.shift(),
      ])) {
        case completeChannel: {
          ticker.stop();
          expect(tickerCount).to.be.within(EXPECTED_TICK_COUNT - 1, EXPECTED_TICK_COUNT + 1);
          return;
        }

        case ticker.c: {
          tickerCount += 1;
          break;
        }
      }
    }
  });
});
