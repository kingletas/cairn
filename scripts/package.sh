#!/usr/bin/env bash
#
# package.sh -- build the installers for the machine this runs on.
#
# Usage:
#   scripts/package.sh [electron-builder arguments]
#
# Only for this machine. The Rust key module and the database binding are compiled
# against the host and neither cross-builds, which is why a release is built once on
# each operating system rather than four times on one.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

# fpm shells out to rpmbuild and says so in a wall of its own arguments. Said here
# instead, before twenty minutes of packaging ends on a missing tool.
if [[ "$(uname -s)" == "Linux" ]] && ! command -v rpmbuild >/dev/null 2>&1; then
  cat >&2 <<'MISSING'
cairn: rpmbuild is not installed, so the .rpm cannot be built.

  Everything else still builds. Install it if you want the Fedora and openSUSE
  package too:

    sudo apt-get install rpm      # Debian, Ubuntu, Mint
    sudo dnf install rpm-build    # Fedora, RHEL

  Or build the rest on its own:

    npx electron-builder --linux AppImage deb tar.gz --publish never

MISSING
  exit 2
fi

exec npx electron-builder --publish never "$@"
