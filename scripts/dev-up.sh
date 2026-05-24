#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -d "$ROOT_DIR/.venv/bin" ]; then
  export PATH="$ROOT_DIR/.venv/bin:$PATH"
fi

BACKEND_PID=""
FRONTEND_PID=""
CLEANED_UP=0

cleanup() {
  if [ "$CLEANED_UP" -eq 1 ]; then
    return
  fi
  CLEANED_UP=1

  local exit_code=$?

  echo
  echo "Stopping local dev processes..."
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ]; then
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  echo "Local dev processes stopped."

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

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

BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:5173"

echo "Starting backend: uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

echo "Waiting for backend healthz at ${BACKEND_URL}/healthz ..."
ready=false
for _ in {1..40}; do
  if curl -fsS "${BACKEND_URL}/healthz" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited before readyz passed."
    exit 1
  fi
  sleep 0.5
done

if [ "$ready" != "true" ]; then
  echo "Timed out waiting for backend healthz after 20s."
  exit 1
fi

echo "Backend ready · Frontend will use REAL WS · LLM_PROVIDER=${LLM_PROVIDER}"
echo "Starting frontend: npm run dev -- --host=127.0.0.1"
npm run dev -- --host=127.0.0.1 &
FRONTEND_PID=$!

echo "Backend URL:  ${BACKEND_URL}"
echo "Frontend URL: ${FRONTEND_URL}"
echo "Press Ctrl-C to stop both processes."

wait
