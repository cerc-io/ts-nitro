set -e

yarn build:contracts

yarn typechain --target ethers-v5 --out-dir ./src/contract-bindings \
"./node_modules/@statechannels/nitro-protocol/dist/artifacts/contracts/NitroAdjudicator.sol/NitroAdjudicator.json" \
"./node_modules/@statechannels/nitro-protocol/dist/artifacts/contracts/ConsensusApp.sol/ConsensusApp.json" \
"./node_modules/@statechannels/nitro-protocol/dist/artifacts/contracts/VirtualPaymentApp.sol/VirtualPaymentApp.json" \
"./artifacts/test/contracts/Token.sol/Token.json"
