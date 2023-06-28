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
    cp <PATH_TO_FIRST_REPO>/packages/util/src/test/addresses.json <PATH_TO_SECOND_REPO>/packages/util/src/test/
    ```

  * Build packages for browser environment

    ```
    yarn build:browser --ignore @cerc-io/example-web-app
    ```

  * Run script to workaround build issue in react app with ESM modules

    ```
    yarn build:fix-modules
    ```

  * Set the relay node multiaddr in example-web-app [.env](./packages/example-web-app/.env)

  * Run browser app in dev mode

    ```
    cd packages/example-web-app

    yarn start
    ```

### Run

* In the first repo which is for NodeJS client

  * Run a client for Alice (`0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE`):

    ```bash
    cd packages/server

    # In packages/server
    yarn start -p 3006 --pk 2d999770f7b5d49b694080f987b82bbc9fc9ac2b4dcc10b0f8aba7d700f69c6d --chainpk ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

    # Expected output:
    # ts-nitro:engine Constructed Engine +0ms
    # ts-nitro:server Started P2PMessageService +0ms
    ```

* Open [app](http://localhost:3000) in browser

  * Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

  * Refresh the app for enabling logs

  * Call method `setupClient('brian')`

  * Wait for `New peer found` log in console

  * Call method `directFund` with address of client Alice and check logs

    ```
    directFund('0xAAA6628Ec44A8a742987EF3A114dDFE2D4F7aDCE')
    ```

  * Final expected log

    ```
    ts-nitro:engine Objective DirectFunding-0x841b8725d82bdbd67650b101183143dcccf29083e0b127ca90f0f8f81cfd8978 is complete & returned to API +22ms
    ```
