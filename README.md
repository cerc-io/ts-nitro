# ts-nitro

## `NodeJS` - `Browser`

Instructions to run instances of `ts-nitro` clients in NodeJS and browser environments and create a ledger channel between them

### Prerequisite

Run relay node using v2 watcher

### Setup

* Clone `ts-nitro` repo in a separate directory which will be used for running the client in browser environment

* In the first repo follow steps from [server readme setup](./packages/server/README.md#setup) for NodeJS environment client

* In second repo follow these steps:

  * In root of the repo, install depedencies:

    ```bash
    yarn
    ```

  * Copy the deployed contract addresses from 1st repo

    ```bash
    cp <PATH_TO_FIRST_REPO>/packages/nitro-util/nitro-addresses.json <PATH_TO_SECOND_REPO>/packages/example-web-app/src/nitro-addresses.json
    ```

  * Build packages for browser environment

    ```bash
    yarn build:browser --ignore @cerc-io/example-web-app
    ```

  * Set the relay node multiaddr in example-web-app [.env](./packages/example-web-app/.env)

  * Run browser app in dev mode

    ```bash
    cd packages/example-web-app

    yarn start
    ```

### Run

* Open [app](http://localhost:3000) in browser

* Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

* Refresh the app for enabling logs

* Setup client

  ```bash
  const nitro = await setupClient('charlie')
  ```

* Assign private keys of Bob to variables

    ```bash
    # In packages/server
    export BOB_PK=0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4
    export BOB_CHAIN_PK=59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
    export CHARLIE_ADDRESS=0x67D5b55604d1aF90074FcB69b8C51838FFF84f8d
    ```

* Run the client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`) and pass in Charlie’s address as a counterparty to create the ledger channel with::

    ```bash
    # In packages/server
    yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --direct-fund --counterparty $CHARLIE_ADDRESS --get-ledger-channel --amount 1000000

    # Expected output:
    # ts-nitro:engine Constructed Engine +0ms
    # ts-nitro:server Started P2PMessageService +0ms
    # .
    # ts-nitro:engine Objective DirectFunding-0x82153f26fcbe95d5add755d0bfe63ef5940615a8a7fd6ec65822339300e4e268 is complete & returned to API +35ms
    # ts-nitro:server Ledger channel created with id 0x82153f26fcbe95d5add755d0bfe63ef5940615a8a7fd6ec65822339300e4e268 +6s
    ```

* Assign ledger channel id in output log above to an environment variable

    ```bash
    export LEDGER_CHANNEL_ID=<LEDGER_CHANNEL_ID>
    ```

* Run client for Bob again to create virtual payment channel:

    ```bash
    yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --virtual-fund --counterparty $CHARLIE_ADDRESS --get-payment-channel --amount 1000

    # Final Expected output:
    # ts-nitro:engine Objective VirtualFund-0xf112143060c59a6d2c5b2d429ca46eb48286e1ca1301da60b9a1a184ad1a58bb is complete & returned to API +1ms
    # ts-nitro:server Virtual payment channel created with id 0xf112143060c59a6d2c5b2d429ca46eb48286e1ca1301da60b9a1a184ad1a58bb +999ms
    ```

* Assign payment channel id in output log above to an environment variable

    ```bash
    export PAYMENT_CHANNEL_ID=<PAYMENT_CHANNEL_ID>
    ```

* Run client for Bob to make payment:

    ```bash
    yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --pay --amount 50 --payment-channel $PAYMENT_CHANNEL_ID --wait
    ```

  * Wait for voucher received log in client Charlie

* Check status of payment channel after making payments in browser

    ```bash
    out(await nitro.getPaymentChannel("<$PAYMENT_CHANNEL_ID>"))
    ```

* Close virtual payment channel using client Bob

  ```bash
  yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --virtual-defund --payment-channel $PAYMENT_CHANNEL_ID --get-payment-channel

  # Final Expected output:
  # ts-nitro:engine Objective VirtualDefund-0xe613b9f1651f971473061a968823463e9570b83230c2bce734b21800f663e4aa is complete & returned to API +1ms
  # ts-nitro:server Virtual payment channel with id 0xe613b9f1651f971473061a968823463e9570b83230c2bce734b21800f663e4aa closed
  ```

* Close the ledger channel using client Bob

  ```bash
  yarn cli --pk $BOB_PK --chainpk $BOB_CHAIN_PK --store ./out/bob-db --direct-defund --ledger-channel $LEDGER_CHANNEL_ID --get-ledger-channel

  # Final Expected output:
  # ts-nitro:engine Objective DirectDefunding-0xe29e2d7ee060fb78b279ac4c8f5cc9bf59334f3e0d25315d5e3c822ed0303d9e is complete & returned to API +1ms
  # ts-nitro:server Ledger channel with id 0xe29e2d7ee060fb78b279ac4c8f5cc9bf59334f3e0d25315d5e3c822ed0303d9e closed
  ```

* Check balance of accounts on chain

    ```bash
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
    # Result: 2000000

   # Charlie's balance
    echo $(
      printf "Result: %d" $(
        curl -sk -X GET -H "Content-Type: application/json" --data '{
          "jsonrpc":"2.0",
          "method":"eth_getBalance",
          "params": ["0x67D5b55604d1aF90074FcB69b8C51838FFF84f8d", "latest"],
          "id":1
        }' http://localhost:8545 | jq -r '.result'
      )
    )
    # Expected output:
    # Result: 1000050
    ```

### Clean up

* In NodeJS environment clear storage by deleting DB directories in `/packages/server`

    ```bash
    rm -r ./out
    ```

* In browser apps call `clearClientStorage` method to delete all indexedDBs

    ```bash
    clearClientStorage()
    ```
