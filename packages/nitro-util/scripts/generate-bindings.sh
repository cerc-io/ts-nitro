set -e

yarn typechain --target ethers-v5 --out-dir ./src/contract-bindings \
"./contracts/NitroAdjudicator.json" \
"./contracts/ConsensusApp.json" \
"./contracts/VirtualPaymentApp.json" \
"./contracts/Token.json"
