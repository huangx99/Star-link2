#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-9910}"
HOST="${HOST:-127.0.0.1}"
LOG_FILE="${ROOT_DIR}/server-9910.log"

existing_pid="$(ss -ltnp "( sport = :${PORT} )" 2>/dev/null | awk -F 'pid=' 'NF > 1 {split($2, a, /[,)]/); print a[1]; exit}')"
if [[ -n "${existing_pid}" ]]; then
  kill "${existing_pid}" 2>/dev/null || true
  sleep 1
fi

nohup env HOST="${HOST}" PORT="${PORT}" node "${ROOT_DIR}/server.js" >"${LOG_FILE}" 2>&1 </dev/null &
echo $! >"${ROOT_DIR}/server-9910.pid"

echo "Serving ${ROOT_DIR}/index.html at http://${HOST}:${PORT}/"
