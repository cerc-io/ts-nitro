import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import baseConfig from './webpack.common';

const config: webpack.Configuration = merge(baseConfig, {
  mode: 'development',
  devtool: 'source-map',
});

export default config;
