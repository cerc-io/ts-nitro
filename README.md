# ts-nitro

## Integration Tests

Install dependencies

```
yarn
```

### NodeJS

* Build packages

	```
	yarn build:node
	```

* Start chain

	```
	yarn chain
	```

* Deploy contracts for test

	```
	yarn test:deploy-contracts
	```

* Run test in server package

	```
	cd packages/server

	yarn test:e2e
	```

### Browser

* Build packages

	```
	yarn build:browser --ignore @cerc-io/example-web-app
	```

* Deploy contracts for test

	```
	yarn test:deploy-contracts
	```

* Run browser app in dev mode

	```
	cd example-web-app

	yarn start
	```

* Open app in 2 different browsers

	* Open console in browser inspect and call methods `setupClient('alice')` and `setupClient('bob')` in different browsers

	* Check `window.msgService.peers` in console to see if peers have exchanged info

	* (IN PROGRESS) Call method `window.directFund`
