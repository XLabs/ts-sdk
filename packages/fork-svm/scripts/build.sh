#!/bin/bash

set -euo pipefail

#liteSVM uses yarn to build (see https://github.com/LiteSVM/litesvm/blob/8f6bd90bec72afc39d88f4032e1826be5294353c/crates/node-litesvm/package.json#L70)
if ! command -v yarn &> /dev/null; then
  echo "Error: yarn is required to build liteSVM. Please install yarn."
  exit 1
fi

rm -rf temp-litesvm
git clone --depth 1 https://github.com/LiteSVM/litesvm.git temp-litesvm
cd temp-litesvm/crates/node-litesvm && yarn install && yarn run build
cd ../../..
mkdir -p ./src/liteSvm
cp -r temp-litesvm/crates/node-litesvm/litesvm/{internal.*,litesvm.*.node} ./src/liteSvm/
rm -rf temp-litesvm
