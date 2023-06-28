# example-web-app

Instructions to run two instances of `ts-nitro` clients in a browser environment and create a ledger channel between them

## Prerequisite

Run relay node using v2 watcher

## `ts-nitro` - `ts-nitro`

Instructions to run two instances of `ts-nitro` clients in browser environment and create a ledger channel between them

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
  # Contracts deployed, addresses written to ~/ts-nitro/packages/util/src/test/addresses.json
  ```

* Build packages for browser environment

  ```
  yarn build:browser --ignore @cerc-io/example-web-app
  ```

* Run script to workaround build issue in react app with ESM modules

  ```
  yarn build:fix-modules
  ```

* Set the relay node multiaddr in example-web-app [.env](./.env)

* Run browser app in dev mode

  ```
  cd packages/example-web-app

  yarn start
  ```
### Run

* Open [app](http://localhost:3000) in 2 different browsers

* Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

* Refresh the apps for enabling logs

* Call methods `setupClient('brian')` and `setupClient('charlie')` separately in the 2 browsers

* Wait for `New peer found` log in console

* Call method `directFund` with address of the other browser client and check logs

  * For example, call directFund in Brian browser with Charlie's address
    
    ```
    directFund('0x67D5b55604d1aF90074FcB69b8C51838FFF84f8d')
    ```

  * Final expected log

    ```
    ts-nitro:engine Objective DirectFunding-0x841b8725d82bdbd67650b101183143dcccf29083e0b127ca90f0f8f81cfd8978 is complete & returned to API +22ms
    ```

## `ts-nitro` - `go-nitro`

Instructions to run instances of `ts-nitro` (browser) and `go-nitro` clients and create a ledger channel between them

### Setup

* Follow the setup steps in the [`ts-nitro`-`ts-nitro`](#setup) section

* In `statechannels/go-nitro`, install dependencies:

  ```bash
  go mod tidy
  ```

### Run

* Run a `go-nitro` client for Bob (`0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94`):

  ```bash
  # In statechannels/go-nitro
  go run . -msgport 3006 -wsmsgport 5006 -rpcport 4006 -pk 0279651921cd800ac560c21ceea27aab0107b67daf436cdd25ce84cad30159b4 -chainpk 59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d -naaddress 0x5FbDB2315678afecb367f032d93F642f64180aa3 -vpaaddress 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 -caaddress 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

  # Expected output:
  # Initialising mem store...
  # Initializing chain service and connecting to ws://127.0.0.1:8545...
  # Initializing message service on tcp port 3006 and websocket port 5006...
  # P2PMessageService started with Peer Id: 16Uiu2HAmJDxLM8rSybX78FH51iZq9PdrwCoCyyHRBCndNzcAYMes
  # Address: 0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94
  # {"level":"debug","engine":"0xBBB676","time":1687775511148,"caller":"engine.go:151","message":"Constructed Engine"}
  # Initializing websocket RPC transport...
  # Nitro as a Service listening on port 4006
  ```

* Open [app](http://localhost:3000) in browser

* Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

* Refresh the app for enabling logs

* Call method `setupClient('brian')`

* Call method `addPeerByMultiaddr` to connect to client Bob

  ```
  addPeerByMultiaddr('0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94', '/ip4/127.0.0.1/tcp/5006/ws/p2p/16Uiu2HAmJDxLM8rSybX78FH51iZq9PdrwCoCyyHRBCndNzcAYMes')
  ```

* Call method `directFund` with address of client Bob and check logs

  ```
  directFund('0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94')
  ```

* Final expected log

  ```
  ts-nitro:engine Objective DirectFunding-0x841b8725d82bdbd67650b101183143dcccf29083e0b127ca90f0f8f81cfd8978 is complete & returned to API +22ms
  ```

## Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
