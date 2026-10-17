#!/usr/bin/env bash
# Produkční build při běžícím `next dev`: `npm run build:check`.
#
# Od Next 16 má `next dev` vlastní výstup (.next/dev) a `next build` mu ho
# nepřepíše — build jde pustit rovnou v repu. Dřívější kopie repa s odkazem
# na node_modules pod Turbopackem nefunguje (node_modules je mimo turbopack.root).
# Ověřeno 2026-10-17: build v repu, dev server dál vrací 200.

set -euo pipefail

cd "$(dirname "$0")/.."
npx next build
