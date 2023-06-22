# server

Instructions to run two instances of `ts-nitro` clients in a node environment and create a ledger channel between them

## Setup

* In root of the repo, install depedencies and build for node environment:

  ```bash
  yarn && yarn build:node
  ```

* Start a Hardhat chain:

  ```bash
  # In packages/server
  yarn chain
  ```

* Deploy the Nitro protocol contracts:

  ```bash
  # In packages/server
  yarn test:deploy-contracts

  # Expected output:
  # Contrats deployed, addresses written to ~/ts-nitro/packages/server/addresses.json
  ```

## Run

* Run a client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`):

  ```bash
  # In packages/server
  yarn start -p 3006 --pk 0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4 --chainpk 59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  ```

* Run a client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`) and pass in Bob's address as a counterparty to create the ledger channel with:

  ```bash
  # In packages/server
  yarn start -p 3005 --pk 2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d --chainpk ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --direct-fund 0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # ts-nitro:engine Objective DirectFunding-0xe29e2d7ee060fb78b279ac4c8f5cc9bf59334f3e0d25315d5e3c822ed0303d9e is complete & returned to API +26ms
  ```
