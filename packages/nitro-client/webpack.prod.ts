import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import baseConfig from './webpack.common';

const config: webpack.Configuration = merge(baseConfig, {
  mode: 'production',
  optimization: {
    // Add production-specific optimizations here
  },
});

export default config;
