# Development

## Generate contract bindings

* Clone the go-nitro repo (<https://github.com/statechannels/go-nitro>) and run `yarn` in root of repo.

* Move to `go-nitro/packages/nitro-protocol/` and run `yarn hardhat compile` to compile the contract

  ```bash
  $ yarn hardhat compile
  Generating typings for: 43 artifacts in dir: typechain-types for target: ethers-v5
  Successfully generated 67 typings!
  Compiled 42 Solidity files successfully
  ```

* Copy files `ConsensusApp.json` `NitroAdjudicator.json` `VirtualPaymentApp.json` from go-nitro `packages/nitro-protocol/artifacts` to ts-nitro `packages/nitro-util/contracts`

* In ts-nitro `packages/nitro-util` run `yarn generate-bindings` to generate the contract bindings

  ```bash
  $ yarn generate-bindings

  yarn run v1.22.19
  $ ./scripts/generate-bindings.sh
  $ /ts-nitro/node_modules/.bin/typechain --target ethers-v5 --out-dir ./src/contract-bindings ./contracts/NitroAdjudicator.json ./contracts/ConsensusApp.json ./contracts/VirtualPaymentApp.json ./contracts/Token.json
  Successfully generated 11 typings!
  Done in 1.27s.
  ```
