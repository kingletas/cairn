#!/usr/bin/env bash
# Print one version's section from CHANGELOG.md, for a release body.
#
# Usage: packaging/release-notes.sh 0.1.0
#        packaging/release-notes.sh          # the newest section
#
# Exits 1 when the version has no section, so a release cannot ship with an empty
# body and nobody notice.

set -euo pipefail

changelog="$(dirname "$0")/../CHANGELOG.md"
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

printf '%s\n' "$body"
