#!/bin/bash
cd "$(dirname "$0")"

cleanup() {
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "==> 启动后端 (http://127.0.0.1:8000)"
.venv/bin/uvicorn server.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "==> 启动前端 (http://127.0.0.1:5173)"
cd web && npm run dev &
FRONTEND_PID=$!

wait
