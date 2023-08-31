import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: '0.8.18',
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 5000,
      },
    },
  },
};

export default config;
