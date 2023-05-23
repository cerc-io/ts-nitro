import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import commonConfigs from './webpack.common';

const prodConfigs: webpack.Configuration[] = commonConfigs.map(
  (config) => merge(config, {
    mode: 'production',
    optimization: {
      // Add production-specific optimizations here
    },
  }),
);

export default prodConfigs;
