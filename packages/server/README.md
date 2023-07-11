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

* In `nodejs-ts-nitro` repo change directory to `packages/server`

    ```bash
    cd packages/server
    ```

* Assign private keys of Bob to variables

    ```bash
    export BOB_PK=0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4
    export BOB_CHAIN_PK=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
    ```

* Run a client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`) with `wait` flag to keep it running:

  ```bash
  # In packages/server
  yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --wait

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  ```

* Assign private keys of Alice and address of Bob to variables

    ```bash
    export ALICE_PK=2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d
    export ALICE_CHAIN_PK=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    export BOB_ADDRESS=0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94
    ```

* Run another client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`) and pass in Bob's address as a counterparty to create the ledger channel with:

  ```bash
  # In packages/server
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --direct-fund --counterparty $BOB_ADDRESS --amount 1000000

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # ts-nitro:engine Objective DirectFunding-0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d is complete & returned to API +12ms
  # ts-nitro:server Ledger channel created with id 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d +9s
  ```

* Assign ledger channel id in output log above to an environment variable

    ```bash
    export LEDGER_CHANNEL_ID=<LEDGER_CHANNEL_ID>
    ```

* Run command to get ledger channel information

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-ledger-channel --ledger-channel $LEDGER_CHANNEL_ID

  # Expected output:
  # ts-nitro:server Ledger channel 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d status:
  # ts-nitro:server  {
  #   "ID": "0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d",
  #   "Status": "Open",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Hub": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Client": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "HubBalance": 1000000,
  #     "ClientBalance": 1000000
  #   }
  # } +194ms
  ```

* Run client for Alice again to create virtual payment channel:

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --virtual-fund --counterparty $BOB_ADDRESS --amount 1000

  # Final Expected output:
  # ts-nitro:engine Objective VirtualFund-0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel created with id 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 +813ms

  ```

* Assign payment channel id in output log above to an environment variable

    ```bash
    export PAYMENT_CHANNEL_ID=<PAYMENT_CHANNEL_ID>
    ```

* Run command to get payment channel information

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-payment-channel --payment-channel $PAYMENT_CHANNEL_ID

  # Expected output:
  # ts-nitro:server Virtual payment channel 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 status:
  # ts-nitro:server  {
  #   "ID": "0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992",
  #   "Status": "Open",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Payee": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Payer": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "PaidSoFar": 0,
  #     "RemainingFunds": 1000
  #   }
  # } +179ms
  ```

* Run client for Alice to make payment:

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --pay --amount 50 --payment-channel $PAYMENT_CHANNEL_ID --wait

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # Sending message: {"to":"0xBBB676","from":"0xAAA662","payloadSummaries":[],"proposalSummaries":[],"payments":[{"amount":50,"channelId":"0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992"}],"rejectedObjectives":[]} +180ms
  ```

  * Wait for voucher receieved log in client Bob

    ```bash
    # Expected output:
    # ts-nitro:util:helpers Received voucher: {
    # ts-nitro:util:helpers   "ChannelId": "0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992",
    # ts-nitro:util:helpers   "Amount": 50,
    # ts-nitro:util:helpers   "Signature": {
    # ts-nitro:util:helpers     "R": "Sps5YQwVZUsLCTC0DVBOiYUQJp4iI4nqAOlUxGUS44E=",
    # ts-nitro:util:helpers     "S": "SbTXk2CtNG1z9ZI1azAYyUvgjrm25OrsyAZ/Qz7egLo=",
    # ts-nitro:util:helpers     "V": 28
    # ts-nitro:util:helpers   }
    # ts-nitro:util:helpers } +0ms
    ```

  * Close client Alice after getting above log

  * Pay command can be run multiple times

* Check status of payment channel after making payments

    ```bash
    yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-payment-channel --payment-channel $PAYMENT_CHANNEL_ID
    ```

* Close virtual payment channel using client Alice

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --virtual-defund --payment-channel $PAYMENT_CHANNEL_ID --get-payment-channel

  # Final Expected output:
  # ts-nitro:engine Objective VirtualDefund-0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel with id 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 closed
  # ts-nitro:server Virtual payment channel 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 status:
  # ts-nitro:server  {
  #   "ID": "0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992",
  #  "Status": "Complete",
  #  "Balance": {
  #    "AssetAddress": "0x0000000000000000000000000000000000000000",
  #    "Payee": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #    "Payer": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #    "PaidSoFar": 100,
  #    "RemainingFunds": 900
  #   }
  # } +1ms
  ```

* Close the ledger channel using client Alice

  ```bash
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --direct-defund --ledger-channel $LEDGER_CHANNEL_ID --get-ledger-channel

  # Final Expected output:
  # ts-nitro:engine Objective DirectDefunding-0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d is complete & returned to API +1ms
  # ts-nitro:server Ledger channel with id 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d closed
  # ts-nitro:server Ledger channel 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d status:
  # ts-nitro:server  {
  #   "ID": "0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d",
  #   "Status": "Complete",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Hub": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Client": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "HubBalance": 1000100,
  #     "ClientBalance": 999900
  #   }
  # }
  ```

* Check balance of accounts on chain

    ```bash
    # Alice's balance
    echo $(
      printf "Result: %d" $(
        curl -sk -X GET -H "Content-Type: application/json" --data '{
          "jsonrpc":"2.0",
          "method":"eth_getBalance",
          "params": ["0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE", "latest"],
          "id":1
        }' http://localhost:8545 | jq -r '.result'
      )
    )
    # Expected output:
    # Result: Amount equal to "ClientBalance" of the closed ledger channel

    # Bob's balance
    echo $(
      printf "Result: %d" $(
        curl -sk -X GET -H "Content-Type: application/json" --data '{
          "jsonrpc":"2.0",
          "method":"eth_getBalance",
          "params": ["0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94", "latest"],
          "id":1
        }' http://localhost:8545 | jq -r '.result'
      )
    )
    # Expected output:
    # Result: Amount equal to "HubBalance" of the closed ledger channel
    ```

### Clean up

* In NodeJS environment clear storage by deleting DB directories in `/packages/server`

    ```bash
    rm -r ./out
    ```

## `ts-nitro` - `go-nitro`

Instructions to run instances of `ts-nitro` (node) and `go-nitro` clients and create a ledger channel between them

### Setup

* Follow the setup steps in the [`ts-nitro`-`ts-nitro`](#setup) section

* In `statechannels/go-nitro`, checkout to branch required for interops

  ```bash
  git checkout ts-interop
  ```

* Install dependencies:

  ```bash
  go mod tidy
  ```

### Run

* Assign private keys of Erin to variables

    ```bash
    # In statechannels/go-nitro
    export ERIN_PK=0aca28ba64679f63d71e671ab4dbb32aaa212d4789988e6ca47da47601c18fe2
    export ERIN_CHAIN_PK=7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
    ```

* Assign contract addresses to variables

    ```bash
    # In statechannels/go-nitro
    export NA_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
    export VPA_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
    export CA_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
    ```

* Run a client for Erin (0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01):

  ```bash
  # In statechannels/go-nitro
  go run . -msgport 3006 -wsmsgport 5006 -rpcport 4006 -pk $ERIN_PK -chainpk $ERIN_CHAIN_PK -naaddress $NA_ADDRESS -vpaaddress $VPA_ADDRESS -caaddress $CA_ADDRESS

  # Expected output:
  # Initialising mem store...
  # Initializing chain service and connecting to ws://127.0.0.1:8545...
  # Initializing message service on tcp port 3006 and websocket port 5006...
  # P2PMessageService started with Peer Id: 16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH
  # Address: 0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01
  # {"level":"debug","engine":"0xB2B22e","time":1688632729155,"caller":"engine.go:151","message":"Constructed Engine"}
  # Initializing websocket RPC transport...
  # Nitro as a Service listening on port 4006

* Assign private keys of Alice and address of Erin to variables

    ```bash
    # In packages/server
    export ALICE_PK=2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d
    export ALICE_CHAIN_PK=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
    export ERIN_ADDRESS=0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01
    ```

* Run client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`) and pass in Erin's address as a counterparty to create the ledger channel with:

  ```bash
  # In packages/server
  yarn cli --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --direct-fund --counterparty $ERIN_ADDRESS --amount 1000000 --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # ts-nitro:engine Objective DirectFunding-0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d is complete & returned to API +12ms
  # ts-nitro:server Ledger channel created with id 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d +9s
  ```

* Assign ledger channel id in output log above to an environment variable

    ```bash
    export LEDGER_CHANNEL_ID=<LEDGER_CHANNEL_ID>
    ```

* Run command to get ledger channel information

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-ledger-channel --ledger-channel $LEDGER_CHANNEL_ID --counterparty $ERIN_ADDRESS --amount 1000000 --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Expected output:
  # ts-nitro:server Ledger channel 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d status:
  # ts-nitro:server  {
  #   "ID": "0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d",
  #   "Status": "Open",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Hub": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Client": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "HubBalance": 1000000,
  #     "ClientBalance": 1000000
  #   }
  # } +194ms
  ```

* Run client for Alice again to create virtual payment channel:

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --virtual-fund --counterparty $ERIN_ADDRESS --amount 1000 --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Final Expected output:
  # ts-nitro:engine Objective VirtualFund-0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel created with id 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 +813ms

  ```

* Assign payment channel id in output log above to an environment variable

    ```bash
    export PAYMENT_CHANNEL_ID=<PAYMENT_CHANNEL_ID>
    ```

* Run command to get payment channel information

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-payment-channel --payment-channel $PAYMENT_CHANNEL_ID  --counterparty $ERIN_ADDRESS --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Expected output:
  # ts-nitro:server Virtual payment channel 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 status:
  # ts-nitro:server  {
  #   "ID": "0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992",
  #   "Status": "Open",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Payee": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Payer": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "PaidSoFar": 0,
  #     "RemainingFunds": 1000
  #   }
  # } +179ms
  ```

* Run client for Alice to make payment:

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --pay --amount 50 --payment-channel $PAYMENT_CHANNEL_ID --wait  --counterparty $ERIN_ADDRESS --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Expected output:
  # ts-nitro:engine Constructed Engine +0ms
  # ts-nitro:server Started P2PMessageService +0ms
  # .
  # .
  # Sending message: {"to":"0xBBB676","from":"0xAAA662","payloadSummaries":[],"proposalSummaries":[],"payments":[{"amount":50,"channelId":"0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992"}],"rejectedObjectives":[]} +180ms
  ```

* Check status of payment channel after making payments

    ```bash
    yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --get-payment-channel --payment-channel $PAYMENT_CHANNEL_ID  --counterparty $ERIN_ADDRESS --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'
    ```

* Close virtual payment channel using client Alice

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --virtual-defund --payment-channel $PAYMENT_CHANNEL_ID  --counterparty $ERIN_ADDRESS --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Final Expected output:
  # ts-nitro:engine Objective VirtualDefund-0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel with id 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 closed
  # ts-nitro:server Virtual payment channel 0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992 status:
  # ts-nitro:server  {
  #   "ID": "0x033d8dcf8a34333cf7807082c03cb940241a3a115a7fa44e47de2c9ec7e5e992",
  #  "Status": "Complete",
  #  "Balance": {
  #    "AssetAddress": "0x0000000000000000000000000000000000000000",
  #    "Payee": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #    "Payer": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #    "PaidSoFar": 100,
  #    "RemainingFunds": 900
  #   }
  # } +1ms

  ```

* Close the ledger channel using client Alice

  ```bash
  yarn cli -p 3005 --pk $ALICE_PK --chainpk $ALICE_CHAIN_PK --store ./out/alice-db --direct-defund --ledger-channel $LEDGER_CHANNEL_ID --get-ledger-channel --counterparty $ERIN_ADDRESS --cp-multiaddr '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmF7aWvcJoAWWE5LqRoxnZJUBbeKmtWrb2EN7VZgH9hXVH'

  # Final Expected output:
  # ts-nitro:engine Objective DirectDefunding-0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d is complete & returned to API +1ms
  # ts-nitro:server Ledger channel with id 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d closed
  # ts-nitro:server Ledger channel 0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d status:
  # ts-nitro:server  {
  #   "ID": "0xb18b4a179496b698d1adef6c6a57a8debf75c1000ed69154615a5a4904036e4d",
  #   "Status": "Complete",
  #   "Balance": {
  #     "AssetAddress": "0x0000000000000000000000000000000000000000",
  #     "Hub": "0xbbb676f9cff8d242e9eac39d063848807d3d1d94",
  #     "Client": "0xaaa6628ec44a8a742987ef3a114ddfe2d4f7adce",
  #     "HubBalance": 1000100,
  #     "ClientBalance": 999900
  #   }
  # }
  ```

* Check balance of accounts on chain

    ```bash
    # Alice's balance
    echo $(
      printf "Result: %d" $(
        curl -sk -X GET -H "Content-Type: application/json" --data '{
          "jsonrpc":"2.0",
          "method":"eth_getBalance",
          "params": ["0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE", "latest"],
          "id":1
        }' http://localhost:8545 | jq -r '.result'
      )
    )
    # Expected output:
    # Result: Amount equal to "ClientBalance" of the closed ledger channel

    # Erin's balance
    echo $(
      printf "Result: %d" $(
        curl -sk -X GET -H "Content-Type: application/json" --data '{
          "jsonrpc":"2.0",
          "method":"eth_getBalance",
          "params": ["0xB2B22ec3889d11f2ddb1A1Db11e80D20EF367c01", "latest"],
          "id":1
        }' http://localhost:8545 | jq -r '.result'
      )
    )
    # Expected output:
    # Result: Amount equal to "HubBalance" of the closed ledger channel
    ```

### Clean up

* Clear storage by deleting DB directories in `nitro-ts-node/packages/server`

    ```bash
    rm -r ./out
    ```
