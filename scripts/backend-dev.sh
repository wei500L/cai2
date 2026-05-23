#!/usr/bin/env bash
set -euo pipefail

echo "Starting Diplomacy backend in dev mode (CORS allows http://localhost:5173)"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

export ENV="${ENV:-dev}"
export LOG_LEVEL="${LOG_LEVEL:-INFO}"
export LLM_PROVIDER="${LLM_PROVIDER:-mock}"
export ENABLE_PERSISTENCE="${ENABLE_PERSISTENCE:-false}"
export EXTRA_CORS_ORIGINS="${EXTRA_CORS_ORIGINS:-}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8000}"
export WS_PATH="${WS_PATH:-/ws}"
export REST_PREFIX="${REST_PREFIX:-/debug/v1}"

uvicorn app.main:app --host "$HOST" --port "$PORT" --reload --log-level info
