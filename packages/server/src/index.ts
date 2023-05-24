import yargs from 'yargs';
import debug from 'debug';

import { P2PMessageService } from '@cerc-io/nitro-client';

const log = debug('ts-nitro:server')

const getArgv = () => {
  return yargs.parserConfiguration({
    'parse-numbers': false
  }).options({
    port: {
      alias: 'p',
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Message service port',
    },
  }).argv;
}

const main = async () => {
  const argv = getArgv();

  const keys = await import('@libp2p/crypto/keys');

  // TODO: Generate private key from a string
  const privateKey = await keys.generateKeyPair('Ed25519');

  const p2pMessageService = await P2PMessageService.newMessageService(
    '127.0.0.1',
    argv.port,
    // TODO: Pass account address
    '',
    privateKey.bytes,
    true
  )

  console.log('p2pMessageService key', p2pMessageService)
}

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
