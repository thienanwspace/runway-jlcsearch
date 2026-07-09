#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v bun >/dev/null || { echo "Install Bun: https://bun.com"; exit 1; }
(sleep 1 && xdg-open "http://127.0.0.1:3080/" 2>/dev/null || open "http://127.0.0.1:3080/" 2>/dev/null) &
exec bun run server.ts