#!/usr/bin/env bash
#
# rebuild-binding.sh -- rebuild the database binding for Electron's ABI, only when it
# is needed, and never while Cairn is running.
#
# Usage:
#   scripts/rebuild-binding.sh        rebuild if Electron cannot load the binding
#   scripts/rebuild-binding.sh -n     say what would happen, and do nothing
#
# Environment overrides:
#   CAIRN_ELECTRON  the Electron binary to probe with (default: the one in node_modules)
#
# The binding is a native module built for one runtime's ABI. `electron-rebuild -f`
# rewrites the file in place on every run, and a running Cairn has that file mapped:
# truncating a mapped file makes the kernel drop the running process's copies of its
# pages, relocations included, so its next query jumps through a table that is back
# to its on-disk state. That was every crash recorded on this machine.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
# Windows names it electron.exe, and cmd cannot run a .sh path at all -- which is why
# package.json calls these through bash.
if [[ -n "${CAIRN_ELECTRON:-}" ]]; then
  electron="$CAIRN_ELECTRON"
elif [[ -x "$here/node_modules/electron/dist/electron.exe" ]]; then
  electron="$here/node_modules/electron/dist/electron.exe"
else
  electron="$here/node_modules/electron/dist/electron"
fi
dry=0
[[ "${1:-}" == "-n" ]] && dry=1

cd "$here"

# Loading the binding is the only honest test of whether it matches this Electron.
if ELECTRON_RUN_AS_NODE=1 "$electron" -e "new (require('better-sqlite3-multiple-ciphers'))(':memory:')" >/dev/null 2>&1; then
  echo "binding: up to date for this Electron"
  exit 0
fi

# A running app has the file mapped. The trailing dot is how the launcher starts the
# app, and it is what tells an app apart from a test run on the same binary.
#
# Windows has no pgrep, and does not need this: it refuses to overwrite a module a
# running process has mapped, so the rebuild fails loudly there instead of leaving a
# running app to jump through a table that has changed underneath it.
if ! command -v pgrep >/dev/null 2>&1; then
  echo "binding: no pgrep here, so this platform's own file locking is what stops a" >&2
  echo "         rebuild under a running Cairn." >&2
elif pgrep -f "$here/node_modules/electron/dist/electron \." >/dev/null 2>&1; then
  echo "binding: needs rebuilding, but Cairn is running. Quit it first -- rebuilding the" >&2
  echo "         module under a running app is what takes it down." >&2
  exit 1
fi

if (( dry )); then
  echo "binding: would rebuild for this Electron"
  exit 0
fi

echo "binding: rebuilding for this Electron"
npx electron-rebuild -f -w better-sqlite3-multiple-ciphers
