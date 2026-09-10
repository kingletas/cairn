#!/usr/bin/env bash
#
# install.sh -- put the launcher on PATH and register the desktop entry and icon.
#
# Usage:
#   scripts/install.sh [PREFIX]      PREFIX defaults to ~/bin
#
# Environment overrides:
#   PREFIX      launcher directory (default: ~/bin)
#   DATA_HOME   XDG data directory (default: ~/.local/share)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${1:-${PREFIX:-$HOME/bin}}"
DATA_HOME="${DATA_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}}"
APP_ID="com.kingletas.Cairn"

if [[ ! -d "$HERE/node_modules" ]]; then
  echo "install.sh: dependencies are not installed. Run 'make deps' first." >&2
  exit 1
fi

# The key module is required rather than optional -- without it the vault cannot be
# opened at all, so a launcher that installs without one is a launcher that fails at
# the passphrase prompt with nothing to say.
if [[ ! -d "$HERE/native" ]]; then
  echo "install.sh: building the key module…"
  (cd "$HERE" && npm run native --silent)
fi

install -d "$PREFIX"
# The launcher runs the app out of this checkout, so it has to know where that is.
sed "s|@CAIRN_HOME@|$HERE|" "$HERE/bin/cairn" > "$PREFIX/cairn.tmp"
install -m 0755 "$PREFIX/cairn.tmp" "$PREFIX/cairn"
rm -f "$PREFIX/cairn.tmp"

desktop_dir="$DATA_HOME/applications"
icon_dir="$DATA_HOME/icons/hicolor/scalable/apps"
install -d "$desktop_dir" "$icon_dir"
sed "s|@LAUNCHER@|$PREFIX/cairn|" "$HERE/data/$APP_ID.desktop" > "$desktop_dir/$APP_ID.desktop"
install -m 0644 "$HERE/data/$APP_ID.svg" "$icon_dir/$APP_ID.svg"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" || true
fi

# A stale icon-theme.cache takes precedence over the directory it sits in, so an icon
# installed after the cache was written stays invisible until the cache is rebuilt --
# and relaunching the app never fixes it. Rebuild it, or delete it so it is rebuilt.
cache="$DATA_HOME/icons/hicolor/icon-theme.cache"
if [[ -f "$cache" ]]; then
  if command -v gtk-update-icon-cache >/dev/null 2>&1 &&
     gtk-update-icon-cache -f -q "$DATA_HOME/icons/hicolor" 2>/dev/null; then
    : # rebuilt
  else
    rm -f "$cache"
  fi
fi

# Say it at install time rather than at first launch. A permissions step discovered
# when somebody is trying to open an app reads as the app being broken.
helper="$HERE/node_modules/electron/dist/chrome-sandbox"
sandbox_owner="$(stat -c '%U' "$helper" 2>/dev/null || echo '?')"
sandbox_mode="$(stat -c '%a' "$helper" 2>/dev/null || echo '?')"

echo "installed: $PREFIX/cairn"
echo "           $desktop_dir/$APP_ID.desktop"
echo
echo "Run 'cairn' from a terminal, or find Cairn in your applications."
if [[ ":$PATH:" != *":$PREFIX:"* ]]; then
  echo
  echo "note: $PREFIX is not on your PATH, so the command will not be found." >&2
fi

if [[ "$sandbox_owner" != "root" || "$sandbox_mode" != "4755" ]]; then
  cat >&2 <<SANDBOX

One step left, and it needs a password.

  Chromium isolates the parts of Cairn that read a web page, and the helper that does
  it has to be owned by root. npm installs it as you, so this cannot be done for you:

    sudo chown root:root '$helper' && sudo chmod 4755 '$helper'

  Cairn will not start until then. It holds a resume and a pay figure, and running
  unsandboxed to get past a permissions message is not a trade it makes quietly.
SANDBOX
fi
