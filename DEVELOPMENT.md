# Porting go-nitro latest commits

## Skipped go-nitro Commits / Features

* Usage of bearer auth tokens
    * https://github.com/statechannels/go-nitro/pull/1351 | https://github.com/cerc-io/go-nitro/commit/903239959d2ffce936060932fca5476f50430668
* Kademlia-dht peer discovery
    * https://github.com/statechannels/go-nitro/pull/1462
    * Use libp2p notifications
        * https://github.com/statechannels/go-nitro/pull/1488/files
        * Skipping `libp2p.NATPortMap()`
* Implement a basic reverse payment proxy
    * https://github.com/statechannels/go-nitro/pull/1483
* Implement and use `WaitForLedgerChannelStatus` and `WaitForPaymentChannelStatus` methods in Nitro class
    * https://github.com/statechannels/go-nitro/pull/1829
* Implement and use `onPaymentChannelUpdated` method in Nitro class
    * https://github.com/statechannels/go-nitro/pull/1801

## Tests pending

- Removed try/catch in run method of Engine, check present implementation handles all the error
    - https://github.com/cerc-io/ts-nitro/pull/98
    - Check all the error are returned from engine handler without throwing
    - Create error in engine handlers and test it
- Test JsonRpcError
    - https://github.com/cerc-io/ts-nitro/pull/101
    - Create error in getPaymentChannelInfo by providing invalid payment channel id.
- Check errorChan in eth chain service is working properly.
    - https://github.com/cerc-io/ts-nitro/pull/105
    - Create error in eth chain service and check how errorChan handles it.
- Test nonFatalErrors in engine
    - https://github.com/cerc-io/ts-nitro/pull/104
    - https://github.com/statechannels/go-nitro/pull/1380/files
    - Test wrapped error
    - Test failed engine events
- Test the context class implementation
    - https://github.com/cerc-io/ts-nitro/pull/105
    - Test it behaves like Go context
- Test the signature serialisation and deserialisation
    - https://github.com/cerc-io/ts-nitro/pull/107
- Conducting direct defund when virtual channel is running, error is thrown and no commands work.
    - Debug this problem.
    - Check this problem exists in go-nitro.
- Channel id in chain event after direct-defund is not matching actual ledger channel while conducting mobymask-ui <-> mobymask-v3-watcher-ts test.
    - Logs with mismatched channel ids
        ```
        ts-nitro:engine Sending chain transaction for channel 0x47b39e54746a42402921182dfb512917f78f358b991c05cabfdcebde870656b5 +0ms
        common.js:113 ts-nitro:engine handling chain event: Channel 0x6add310cbde988eb3e10f45325b40041bd2d5c389faef0c5a3bc5b32f69fbdc5 concluded at Block 6 +22s
        ```
    - Steps to reproduce:
        - Run Hardhat in [auto mining mode ](https://hardhat.org/hardhat-network/docs/explanation/mining-modes), mobymask-ui and mobymask-v3-watcher-ts.
        - Conduct test till direct-defund command (in the initial set up the bug will not appear).
        - Stop all the services, restart chain, clear store and run above set up repeatedly.
- Funding more virtual channels than their ledger channel supports.
    - Not able to create virtual channels if they exceed ledger channel capacity.
    - Check whether go-nitro also get below error.
        ```bash
        Error: error updating ledger funding: Error: error proposing ledger update: Error: propose could not add new state vars: Error: insufficient funds at be.crank
        (http://localhost:3000/static/js/bundle.js:138464:19)    at async Ge.attemptProgress
        (http://localhost:3000/static/js/bundle.js:139637:25)    at async Ge.handleMessage
        (http://localhost:3000/static/js/bundle.js:139379:28)    at async Ge.run
        (http://localhost:3000/static/js/bundle.js:139302:24) +0ms
        ```
