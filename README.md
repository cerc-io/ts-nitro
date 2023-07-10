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
    cp <PATH_TO_FIRST_REPO>/packages/util/src/addresses.json <PATH_TO_SECOND_REPO>/packages/util/src/
    ```

  * Build packages for browser environment

    ```
    yarn build:browser --ignore @cerc-io/example-web-app
    ```

  * Set the relay node multiaddr in example-web-app [.env](./packages/example-web-app/.env)

  * Run browser app in dev mode

    ```
    cd packages/example-web-app

    yarn start
    ```

### Run

* In the first repo which is for NodeJS client

  * Run a client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`):

    ```bash
    cd packages/server

    # In packages/server
    yarn cli --pk 0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4 --chainpk 59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

    # Expected output:
    # ts-nitro:engine Constructed Engine +0ms
    # ts-nitro:server Started P2PMessageService +0ms
    ```

* Open [app](http://localhost:3000) in browser

  * Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

  * Refresh the app for enabling logs

  * Setup client
    ```
    const nitro = await setupClient('charlie')
    ```

  * Wait for `New peer found` log in console

  * Call method `nitro.directFund` with address of client Bob and amount to be allocated

    ```
    nitro.directFund('0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94', 1_000_000)
    ```

    Final expected log

    ```
    ts-nitro:engine Objective DirectFunding-0x841b8725d82bdbd67650b101183143dcccf29083e0b127ca90f0f8f81cfd8978 is complete & returned to API +22ms
    Ledger channel created with id 0x841b8725d82bdbd67650b101183143dcccf29083e0b127ca90f0f8f81cfd8978
    ```

  * Call method `nitro.virtualFund` with address of client Bob and amount to be allocated

    ```
    nitro.virtualFund('0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94', 1_000)
    ```

    Final expected log

    ```
    # ts-nitro:engine Objective VirtualFund-0x8b0275a133addd8df2eafc84f2283ddf560a6c75eaafa1709e1f513bee5787af is complete & returned to API +0ms
    Virtual payment channel created with id 0x8b0275a133addd8df2eafc84f2283ddf560a6c75eaafa1709e1f513bee5787af
    ```
