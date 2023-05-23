import * as webpack from 'webpack';
import { merge } from 'webpack-merge';

import commonConfigs from './webpack.common';

const devConfigs: webpack.Configuration[] = commonConfigs.map(
  (config) => merge(config, {
    mode: 'development',
    devtool: 'source-map',
  }),
);

export default devConfigs;
