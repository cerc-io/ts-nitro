const test = (): string => {
  // eslint-disable-next-line no-console
  console.log('Test from nitro-client');

  return 'test output';
};

export * as Client from './client/client';
