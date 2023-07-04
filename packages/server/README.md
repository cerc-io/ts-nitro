# server

### Prerequisite

Run relay node using a v2 watcher

## `ts-nitro` - `ts-nitro`

Instructions to run two instances of `ts-nitro` clients in a node environment and create a ledger and a virtual channel between them

### Setup

* In root of the repo, install depedencies:

  ```bash
  yarn
  ```

* Start a Hardhat chain:

  ```bash
  yarn chain
  ```

* Deploy the Nitro protocol contracts:

  ```bash
  yarn test:deploy-contracts

  # Expected output:
  # Contracts deployed, addresses written to ~/ts-nitro/packages/util/src/addresses.json
  ```

* Build packages for node environment

  ```bash
  yarn build:node
  ```

* Set the relay node multiaddr (`RELAY_MULTIADDR`) in [.env](./.env)

### Run

* Run a client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`):

  ```bash
  # In packages/server
  yarn start -p 3006 --pk 2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d --chainpk ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --store ./alice-db --wait
  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  ```

* Run another client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`) and pass in Alice's address as a counterparty to create the ledger channel with:

  ```bash
  # In packages/server
  yarn start -p 3005 --pk 0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4 --chainpk 59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d --store ./bob-db --counterparty 0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE --direct-fund

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # ts-nitro:engine Objective DirectFunding-0xc47be3b1d43b90be058eaad3cd4f2250e4f9645792125011003bc548d33d2ebc is complete & returned to API +10ms
  # ts-nitro:server Ledger channel created with id 0xc47be3b1d43b90be058eaad3cd4f2250e4f9645792125011003bc548d33d2ebc
  # .
  # .
  # ts-nitro:engine Objective VirtualFund-0x8b0275a133addd8df2eafc84f2283ddf560a6c75eaafa1709e1f513bee5787af is complete & returned to API +0ms
  # ts-nitro:server Virtual payment channel created with id 0x8b0275a133addd8df2eafc84f2283ddf560a6c75eaafa1709e1f513bee5787af
  # .
  # .
  # ts-nitro:engine Sending message: {"to":"0xAAA662","from":"0xBBB676","payloadSummaries":[],"proposalSummaries":[],"payments":[{"amount":50,"channelId":"0xe613b9f1651f971473061a968823463e9570b83230c2bce734b21800f663e4aa"}],"rejectedObjectives":[]} +8ms
  # .
  # .
  # ts-nitro:engine Objective VirtualDefund-0xe613b9f1651f971473061a968823463e9570b83230c2bce734b21800f663e4aa is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel with id 0xe613b9f1651f971473061a968823463e9570b83230c2bce734b21800f663e4aa closed
  # .
  # .
  # ts-nitro:engine Objective DirectDefunding-0x49ee60de0e1beebdf6070690cde0f66c86d576a6b2721001e6f7b0eaa11b3223 is complete & returned to API +1ms
  # ts-nitro:server Ledger channel with id 0x49ee60de0e1beebdf6070690cde0f66c86d576a6b2721001e6f7b0eaa11b3223 closed
  ```

## `ts-nitro` - `go-nitro`

Instructions to run instances of `ts-nitro` (node) and `go-nitro` clients and create a ledger channel between them

### Setup

* Follow the setup steps in the [`ts-nitro`-`ts-nitro`](#setup) section

* In `statechannels/go-nitro`, install dependencies:

  ```bash
  go mod tidy
  ```

### Run

* Run a `go-nitro` client for Erin (`0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01`):

  ```bash
  # In statechannels/go-nitro
  go run . -msgport 3006 -rpcport 4006 -pk 0aca28ba64679f63d71e671ab4dbb32aaa212d4789988e6ca47da47601c18fe2 -chainpk 7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 -naaddress 0x5FbDB2315678afecb367f032d93F642f64180aa3 -vpaaddress 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 -caaddress 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

  # Expected output:
  # Initialising mem store...
  # Initializing chain service and connecting to ws://127.0.0.1:8545...
  # Initializing message service on port 3006...
  # P2PMessageService started with Peer Id: 16Uiu2HAmJDxLM8rSybX78FH51iZq9PdrwCoCyyHRBCndNzcAYMes
  # Address: 0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94
  # {"level":"debug","engine":"0xBBB676","time":1687775511148,"caller":"engine.go:151","message":"Constructed Engine"}
  # Initializing websocket RPC transport...
  # Nitro as a Service listening on port 4006
  ```

* Run a `ts-nitro` client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`) and pass in Bob's address as a counterparty to create the ledger channel with:

  ```bash
  # In ts-nitro/packages/server
  yarn start -p 3005 --pk 2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d --chainpk ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --counterparty 0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01 --cp-peer-id 16Uiu2HAmJDxLM8rSybX78FH51iZq9PdrwCoCyyHRBCndNzcAYMes --cp-port 3006 --direct-fund

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # ts-nitro:engine Objective DirectFunding-0xf253988eaf211642c5449e5707c58ed1a91eb3d60f26a5d2b721f26d12591165 is complete & returned to API +1ms
  # ts-nitro:server Ledger channel created with id 0xf253988eaf211642c5449e5707c58ed1a91eb3d60f26a5d2b721f26d12591165
  ```
