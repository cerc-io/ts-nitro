import { Client } from '@cerc-io/nitro-client';

describe('test Client', () => {
  it('should instantiate multiple Client', () => {
    // TODO: Use Client.new and pass dummy instances
    const client = new Client();

    console.log('Client instantiated', client.constructor.name);
  });
});
