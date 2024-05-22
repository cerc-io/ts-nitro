#!/bin/bash

if [ ! -f "dist/index.js.orig" ]; then
  cp dist/index.js dist/index.js.orig
fi

sed -e "s|.*this.client.eval.*|// UNEVAL|" \
  -e "s|\(.*\)isBrowser = new Function.*;|\1isBrowser = () => true; // UNEVAL|" \
    dist/index.js.orig > dist/index.js
rc=$?

diff -U1 dist/index.js.orig dist/index.js

exit $rc
