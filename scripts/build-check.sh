#!/usr/bin/env bash
# Produkční build v dočasné kopii repa: `npm run build:check`.
#
# `next build` přepisuje složku .next, kterou sdílí běžící `next dev` — ten pak
# vrací 404, dokud se nerestartuje. Kopie (bez node_modules, .next, .git;
# node_modules jako odkaz) se po buildu smaže i s kopií .env.local.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/zakaziq-build.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

rsync -a --exclude node_modules --exclude .next --exclude .git --exclude graphify-out "$ROOT/" "$TMP/"
ln -s "$ROOT/node_modules" "$TMP/node_modules"

cd "$TMP"
npx next build
