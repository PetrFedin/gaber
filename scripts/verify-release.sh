#!/bin/sh
# GABER release-gate replay on a clean checkout. Free local fallback only.
# Usage: sh scripts/verify-release.sh <exact-40-character-commit-SHA>
set -eu
if [ "$#" -ne 1 ]; then
  echo "USAGE: sh scripts/verify-release.sh <exact-40-character-SHA>" >&2
  exit 2
fi
expected=$1
case "$expected" in
  *[!0-9a-f]* | "") echo "INVALID_SHA" >&2; exit 2 ;;
esac
if [ "${#expected}" -ne 40 ]; then
  echo "FULL_40_CHAR_SHA_REQUIRED" >&2
  exit 2
fi
head_sha=$(git rev-parse --verify HEAD)
if [ "$head_sha" != "$expected" ]; then
  echo "CHECKOUT_SHA_MISMATCH: expected=$expected actual=$head_sha" >&2
  exit 1
fi
# Do not prove a tracked SHA while silently testing local edits/untracked code.
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "UNCLEAN_CHECKOUT: release evidence requires a clean Git working tree" >&2
  exit 1
fi
required_node=$(tr -d '\r\n' < .nvmrc)
installed_node=$(node -p 'process.version.slice(1)')
if [ "$required_node" != "$installed_node" ]; then
  echo "NODE_VERSION_MISMATCH required=$required_node actual=$installed_node" >&2
  exit 1
fi
printf 'GABER_RELEASE_GATE_START sha=%s node=%s\n' "$head_sha" "$installed_node"
npm ci
npm run verify:repository
npm test
npm run build
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "RELEASE_TEST_MUTATED_SOURCE_TREE" >&2
  exit 1
fi
printf 'GABER_LOCAL_GATE_GREEN sha=%s\n' "$head_sha"
printf 'NOTICE: local verification is NOT GitHub Actions, PostgreSQL/RLS, browser, or independent review.\n'
