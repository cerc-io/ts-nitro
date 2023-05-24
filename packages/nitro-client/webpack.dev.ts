import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import { browserConfig, nodeConfig } from './webpack.common';

const devConfig: webpack.Configuration = {
  mode: 'development',
  devtool: 'source-map',
};

const devBrowserConfig: webpack.Configuration = merge(browserConfig, devConfig);
const devNodeConfig: webpack.Configuration = merge(nodeConfig, devConfig);

export default (env: { [key: string]: string | boolean }) => {
  if (env.target === 'browser') {
    return devBrowserConfig;
  }

  return devNodeConfig;
};
