import * as webpack from 'webpack';
import * as path from 'path';
import { merge } from 'webpack-merge';

const baseConfig: webpack.Configuration = {
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: '@cerc-nitro/nitro-node',
      type: 'umd',
    },
    libraryTarget: 'umd',
    globalObject: 'this',
    clean: true,
    filename: 'index.js',
    chunkLoading: false,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.(?:js|mjs|cjs)$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: 'chrome 50' }],
            ],
          },
        },
      },
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
        resolve: {
          alias: {
            'uint8arrays/from-string': '../../../../../../../node_modules/uint8arrays/dist/src/from-string.js',
            'uint8arrays/to-string': '../../../../../../../node_modules/uint8arrays/dist/src/to-string.js',
            '@libp2p/crypto/keys': '../../../../../node_modules/@libp2p/crypto/dist/src/keys/index.js',
            '@libp2p/peer-id': '../../../../../node_modules/@libp2p/peer-id/dist/src/index.js',
            '@libp2p/peer-id-factory': '../../../../node_modules/@libp2p/peer-id-factory/dist/src/index.js',
            '@libp2p/peer-id-factory2': '../../../../../node_modules/@libp2p/peer-id-factory/dist/src/index.js',
            'it-pipe': '../../../../../../../node_modules/it-pipe/dist/src/index.js',
            '@multiformats/multiaddr': '../../../../../node_modules/@multiformats/multiaddr/dist/src/index.js',
          },
        },
      },
    ],
  },
};

export const browserConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/browser.ts',
});

export const nodeConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/node.ts',
  target: 'node',
  externals: {
    '@cerc-io/ts-channel': '@cerc-io/ts-channel',
    '@cerc-io/nitro-util': '@cerc-io/nitro-util',
    '@statechannels/exit-format': '@statechannels/exit-format',
    '@statechannels/nitro-protocol': '@statechannels/nitro-protocol',
    lodash: 'lodash',
    'json-bigint': 'json-bigint',
    assert: 'assert',
    debug: 'debug',
    ethers: 'ethers',
    level: 'level',

    // Module is used by @libp2p/websockets in @cerc-io/peer
    // Internal NodeJS modules used by it cannot be resolved in build
    ws: 'ws',
  },
});

export default { browserConfig, nodeConfig };
