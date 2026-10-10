#!/usr/bin/env bash
# Příprava lokálního prostředí a worktree Codexu. --check nic neinstaluje.
set -euo pipefail

ZQ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ZQ_ROOT"

if [[ "${1:-}" != "" && "${1:-}" != "--check" ]] || [[ $# -gt 1 ]]; then
  echo "Použití: bash scripts/codex-setup.sh [--check]" >&2
  exit 2
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Pro prostředí ZakazIQ použijte Node.js 24 nebo novější."); process.exit(1); }'
command -v npm >/dev/null
test -f package-lock.json
node scripts/sync-agent-context.mjs --check

if [[ "${1:-}" == "--check" ]]; then
  echo "Předpoklady prostředí Codexu jsou splněné."
  exit 0
fi

npm ci --no-audit --no-fund
echo "Závislosti nainstalované. Připojení služeb nastavte podle .env.example a docs/CODEX.md."
