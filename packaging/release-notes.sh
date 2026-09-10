#!/usr/bin/env bash
# Print one version's section from CHANGELOG.md, for a release body.
#
# Usage: packaging/release-notes.sh 0.1.0
#        packaging/release-notes.sh          # the newest section
#
# Exits 1 when the version has no section, so a release cannot ship with an empty
# body and nobody notice. CAIRN_CHANGELOG reads a different file, for the tests.

set -euo pipefail

changelog="${CAIRN_CHANGELOG:-$(dirname "$0")/../CHANGELOG.md}"
version="${1:-}"

# With no argument, take the newest released section. "Unreleased" is a heading for
# work in progress, so picking it would produce an empty release body -- which is
# exactly the failure this script exists to prevent.
if [[ -z "$version" ]]; then
  version="$(grep -oE '^## \[[^]]+\]' "$changelog" | tr -d '#[] ' | grep -viFx unreleased | head -1)"
fi

if [[ -z "$version" ]]; then
  echo "The changelog has no released version yet." >&2
  exit 1
fi

body="$(awk -v want="$version" '
  /^## \[/ {
    inside = index($0, "[" want "]") > 0
    next
  }
  inside { print }
' "$changelog")"

if [[ -z "${body//[$' \t\n']/}" ]]; then
  echo "No changelog section for ${version}." >&2
  exit 1
fi

# The changelog wraps its lines, and a release page renders every newline as a
# break, so each paragraph and list item is joined back onto one line. Headings,
# table rows and fenced code are left exactly as written.
printf '%s\n' "$body" | awk '
  function flush() { if (buf != "") print buf; buf = "" }
  /^[[:space:]]*```/ { flush(); fenced = !fenced; print; next }
  fenced { print; next }
  /^[[:space:]]*$/ { flush(); print; next }
  /^[[:space:]]*\|/ || /^#+ / { flush(); print; next }
  /^[[:space:]]*([-*+>] |[0-9]+\. )/ { flush(); buf = $0; next }
  {
    line = $0
    sub(/^[[:space:]]+/, "", line)
    buf = (buf == "") ? $0 : buf " " line
  }
  END { flush() }
'
