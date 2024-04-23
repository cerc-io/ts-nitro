# Development

## Skipped go-nitro Commits / Features

* Usage of bearer auth tokens
  * <https://github.com/statechannels/go-nitro/pull/1351> | <https://github.com/cerc-io/go-nitro/commit/903239959d2ffce936060932fca5476f50430668>
* Kademlia-dht peer discovery
  * <https://github.com/statechannels/go-nitro/pull/1462>
  * Use libp2p notifications
    * <https://github.com/statechannels/go-nitro/pull/1488/files>
    * Skipping `libp2p.NATPortMap()`
* Implement a basic reverse payment proxy
  * <https://github.com/statechannels/go-nitro/pull/1483>

## Known issues (ts-nitro)

* Metamask caching issue after chain restart
  * Error occurs during direct fund transfer in mobymask-ui when the Nitro Node makes an eth_call to the Nitro Adjudicator contract

    ```bash
    Received invalid block tag 1270. Latest block number is 99
    ```

  * <https://ethereum.stackexchange.com/questions/109625/received-invalid-block-tag-87-latest-block-number-is-0>

  * To resolve this issue, attempt changing the network in Metamask and then switch back to the network you're using to connect to the local node

## Known issues (go-nitro)

* Error is thrown when trying to fund virtual channels with amounts more than their ledger channel supports

    ```bash
    panic: error updating ledger funding: error proposing ledger update: propose could not add new state vars: insufficient funds
    goroutine 88 [running]:
    github.com/statechannels/go-nitro/node/engine.(*Engine).checkError(0x748a4ac48e62a6aa?, {0x1e60900, 0xc00048c940})
    go-nitro/node/engine/engine.go:867 +0x139
    github.com/statechannels/go-nitro/node/engine.(*Engine).run(0xc000306500, {0x1e6f948, 0xc0006a09b0})
    go-nitro/node/engine/engine.go:211 +0x852
    created by github.com/statechannels/go-nitro/node/engine.New in goroutine 1
    go-nitro/node/engine/engine.go:164 +0x54b
    ```

* Error is thrown when conducting direct defund while virtual channel is running

    ```bash
    panic: handleAPIEvent: Could not create directdefund objective for {ChannelId:0xecb0d8f2cdd9222b56dc24daa6b10fc2143f7b8861695071e260417d4ad289f6 objectiveStarted:0xc000743da0}: ledger channel has running guarantees
    goroutine 200 [running]:
    github.com/statechannels/go-nitro/node/engine.(*Engine).checkError(0x0?, {0x1e60900, 0xc000b8a240})
    go-nitro/node/engine/engine.go:867 +0x139
    github.com/statechannels/go-nitro/node/engine.(*Engine).run(0xc0009800a0, {0x1e6f948, 0xc000984000})
    go-nitro/node/engine/engine.go:211 +0x852
    created by github.com/statechannels/go-nitro/node/engine.New in goroutine 1
    go-nitro/node/engine/engine.go:164 +0x54b
    ```
