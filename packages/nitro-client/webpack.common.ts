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
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
    ],
  },
  externals: {
    '@chainsafe/libp2p-yamux': '@chainsafe/libp2p-yamux',
    '@libp2p/crypto': '@libp2p/crypto',
    '@libp2p/mdns': '@libp2p/mdns',
    '@libp2p/tcp': '@libp2p/tcp',
    '@nodeguy/channel': '@nodeguy/channel',
    debug: 'debug',
    ethers: 'ethers',
    libp2p: 'libp2p',
  },
};

export const browserConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/browser.ts',
  output: {
    filename: 'browser.js',
  },
});

export const nodeConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/node.ts',
  output: {
    filename: 'node.js',
  },
  target: 'node'
});

export default [
  browserConfig,
  nodeConfig,
];
