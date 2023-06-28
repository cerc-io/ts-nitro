import * as webpack from 'webpack';
import * as path from 'path';
import { merge } from 'webpack-merge';

const baseConfig: webpack.Configuration = {
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: '@cerc-io/nitro-client',
      type: 'umd',
    },
    libraryTarget: 'umd',
    globalObject: 'this',
    clean: true,
    filename: 'index.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    '@nodeguy/channel': '@nodeguy/channel',
    '@cerc-io/nitro-util': '@cerc-io/nitro-util',
    '@statechannels/exit-format': '@statechannels/exit-format',
    '@statechannels/nitro-protocol': '@statechannels/nitro-protocol',
    lodash: 'lodash',
    'json-bigint': 'json-bigint',
    assert: 'assert',
    debug: 'debug',
    ethers: 'ethers',

    // Module is used by @libp2p/websockets in @cerc-io/peer
    // Internal NodeJS modules used by it cannot be resolved in build
    ws: 'ws',
  },
};

export const browserConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/browser.ts',
  // Packages are resolved properly in browser build tool; so not required in build output
  externals: {
    '@chainsafe/libp2p-yamux': '@chainsafe/libp2p-yamux',
    '@chainsafe/libp2p-noise': '@chainsafe/libp2p-noise',
    '@cerc-io/peer': '@cerc-io/peer',

    // TODO: Fix export paths so that it can be resolved by react build
    'it-pipe': 'it-pipe',
    '@libp2p/crypto/keys': '@libp2p/crypto/keys',
    '@libp2p/peer-id-factory': '@libp2p/peer-id-factory',
    '@libp2p/peer-id': '@libp2p/peer-id',
    'uint8arrays/to-string': 'uint8arrays/to-string',
    'uint8arrays/from-string': 'uint8arrays/from-string',
  },
});

export const nodeConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/node.ts',
  target: 'node',
});

export default { browserConfig, nodeConfig };
