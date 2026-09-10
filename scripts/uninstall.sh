#!/usr/bin/env bash
#
# uninstall.sh -- remove what install.sh placed. It touches nothing else.
#
# Your vault is not here and is never removed by this. It lives in the app's own
# data directory, and "Erase everything on this machine" inside Cairn is what
# deletes it.
#
# Usage:
#   scripts/uninstall.sh [PREFIX]    PREFIX defaults to ~/bin

set -euo pipefail

PREFIX="${1:-${PREFIX:-$HOME/bin}}"
DATA_HOME="${DATA_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}}"
APP_ID="com.kingletas.Cairn"

rm -fv "$PREFIX/cairn" \
       "$DATA_HOME/applications/$APP_ID.desktop" \
       "$DATA_HOME/icons/hicolor/scalable/apps/$APP_ID.svg"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DATA_HOME/applications" || true
fi

echo
echo "Your vault was not touched. It is still at ${XDG_CONFIG_HOME:-$HOME/.config}/cairn/vault"
