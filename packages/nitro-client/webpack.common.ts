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
    assert: 'assert',
    debug: 'debug',
    ethers: 'ethers',
  },
};

export const browserConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/browser.ts',
  // Packages are resolved properly in browser build tool; so not required in build output
  externals: {
    '@chainsafe/libp2p-yamux': '@chainsafe/libp2p-yamux',
    '@libp2p/crypto': '@libp2p/crypto',
    '@libp2p/mdns': '@libp2p/mdns',
    '@libp2p/tcp': '@libp2p/tcp',
    libp2p: 'libp2p',
  },
});

export const nodeConfig: webpack.Configuration = merge(baseConfig, {
  entry: './src/node.ts',
  target: 'node',
});

export default { browserConfig, nodeConfig };
