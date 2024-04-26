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
    '@cerc-io/ts-channel': '@cerc-io/ts-channel',
    '@cerc-nitro/nitro-util': '@cerc-nitro/nitro-util',
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
};

export const browserConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/browser.ts',
  // Packages are resolved properly in browser build tool; so not required in build output
  externals: {},
});

export const nodeConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/node.ts',
  target: 'node',
});

export default { browserConfig, nodeConfig };
