#!/usr/bin/env bash
#
# build-keyring.sh -- build the Rust key module and put it in native/ by rename.
#
# Usage:
#   scripts/build-keyring.sh
#
# napi writes its output in place. A running Cairn has the previous file mapped, and
# rewriting a mapped file in place throws away the running copy's relocations, so the
# module is built beside native/ and renamed over it: the file gets a new inode and a
# running app keeps the old one until it quits.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

# The output directory is passed relative to here: napi joins it onto the working
# directory, so an absolute path becomes a doubled one and the build fails on a file
# it wrote a moment earlier.
tmp="$(basename "$(mktemp -d "$here/native.build.XXXXXX")")"
trap 'rm -rf "$here/${tmp:?}"' EXIT

npx napi build --platform --release --cargo-cwd crates/cairn-keyring --js false "$tmp"

mkdir -p native
for built in "$tmp"/*; do
  mv -f "$built" "native/$(basename "$built")"
done
echo "keyring: built and placed by rename"
