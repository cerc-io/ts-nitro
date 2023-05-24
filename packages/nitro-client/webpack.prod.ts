import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import { browserConfig, nodeConfig } from './webpack.common';

const prodConfig: webpack.Configuration = {
  mode: 'production',
  optimization: {
    // Add production-specific optimizations here
  },
};

const prodBrowserConfig = merge(browserConfig, prodConfig);
const prodNodeConfig = merge(nodeConfig, prodConfig);

export default (env: { [key: string]: string | boolean }) => {
  if (env.target === 'browser') {
    return prodBrowserConfig;
  }

  return prodNodeConfig;
};
