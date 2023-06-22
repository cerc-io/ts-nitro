# example-web-app

Instructions to run two instances of `ts-nitro` clients in a browser environment and create a ledger channel between them

## Prerequisite

Run relay node using v2 watcher

## Setup

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
## Run

* Open app in 2 different browsers

* Open console in browser inspect and enable debug logs by setting `localStorage.debug = 'ts-nitro:*'`

* Restart the apps for enabling logs

* Call methods `setupClient('alice')` and `setupClient('bob')` separately in the 2 browsers

* Wait for `New peer found` log in console and check `window.msgService.peers` to see if peers have exchanged info

* Call method `window.directFund` with peer id of other browser and check logs

  * For example, call directFund in Alice browser with Bob's address
    
    ```
    window.directFund('0xBBB676f9cFF8D242e9eaC39D063848807d3D1D94')
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
