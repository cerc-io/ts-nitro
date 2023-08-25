/* eslint-disable import/no-extraneous-dependencies */
import { HardhatUserConfig } from 'hardhat/config';

import '@foundry-rs/hardhat-anvil';

const config: HardhatUserConfig = {
  solidity: '0.8.18',
  defaultNetwork: 'anvil',
  networks: {
    anvil: {
      url: 'http://127.0.0.1:8545/',
      // @ts-expect-error
      launch: true,
    },
  },
};

export default config;
