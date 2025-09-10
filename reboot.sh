#!/usr/bin/env bash
# reboot.sh - start backend, optional voice server, and frontend static server for development
# Usage: ./reboot.sh [--with-voice] [--no-frontend]

set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
VENV_DIR="$ROOT/.venv"
PYTHON=${PYTHON:-python3}
WITH_VOICE=0
NO_FRONTEND=0

for arg in "$@"; do
  case "$arg" in
    --with-voice) WITH_VOICE=1 ;;
    --no-frontend) NO_FRONTEND=1 ;;
    -h|--help)
      echo "Usage: $0 [--with-voice] [--no-frontend]"
      echo "  --with-voice   : attempt to install and start voice_server.py (may require additional heavy packages)"
      echo "  --no-frontend  : do not start the local python static server for frontend"
      exit 0 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

logdir="$ROOT/logs"
mkdir -p "$logdir"

info() { echo -e "[INFO] $*"; }
err() { echo -e "[ERROR] $*" >&2; }

# Stop processes using ports if any
stop_port() {
  local port=$1
  local pids
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"$port" || true)
  else
    pids=$(ss -ltnp 2>/dev/null | awk -v p=$port '$4 ~ (":"p"$|":"p"," ) {print $7}' | cut -d',' -f2 | cut -d'"' -f2 | tr '\n' ' ') || true
  fi
  if [ -n "$pids" ]; then
    info "Killing processes on port $port: $pids"
    for pid in $pids; do
      kill -9 "$pid" >/dev/null 2>&1 || true
    done
  fi
}

info "Stopping services on ports 8000, 5000, 9000 if running"
stop_port 8000 || true
stop_port 5000 || true
stop_port 9000 || true

# Create venv if needed
if [ ! -d "$VENV_DIR" ]; then
  info "Creating virtualenv at $VENV_DIR"
  $PYTHON -m venv "$VENV_DIR"
fi

# Activate venv for this script
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

info "Upgrading pip"
python -m pip install --upgrade pip setuptools wheel >/dev/null

# Install backend deps
if [ -f "$ROOT/backend/requirements.txt" ]; then
  info "Installing backend dependencies into venv"
  pip install -r "$ROOT/backend/requirements.txt" >/dev/null
else
  info "No backend requirements.txt found, installing minimal uvicorn/fastapi"
  pip install fastapi uvicorn requests python-dotenv >/dev/null
fi

# Optionally install voice deps
if [ "$WITH_VOICE" -eq 1 ]; then
  info "Installing voice server dependencies (this may take long and may require system libs)"
  pip install flask flask-cors flask-socketio eventlet soundfile scipy numpy >/dev/null || true
  info "Note: installing 'vosk' via pip may require platform-specific wheels; install manually if needed."
fi

# Start backend with uvicorn
info "Starting backend (uvicorn)"
UVICORN_LOG="$logdir/backend.log"
# Run from repo root so module path backend.src.main works
cd "$ROOT"
nohup uvicorn backend.src.main:app --host 0.0.0.0 --port 8000 --reload > "$UVICORN_LOG" 2>&1 &
UVICORN_PID=$!
sleep 0.5
info "Backend PID=$UVICORN_PID, logs=$UVICORN_LOG"

# Start voice server if requested
if [ "$WITH_VOICE" -eq 1 ]; then
  if [ -f "$ROOT/voice_server.py" ]; then
    info "Starting voice_server.py"
    VOICE_LOG="$logdir/voice.log"
    nohup "$PYTHON" "$ROOT/voice_server.py" > "$VOICE_LOG" 2>&1 &
    VOICE_PID=$!
    sleep 0.5
    info "Voice server PID=$VOICE_PID, logs=$VOICE_LOG"
  else
    err "voice_server.py not found in repo root; skipping voice server start"
  fi
fi

# Start frontend simple static server (optional)
if [ "$NO_FRONTEND" -eq 0 ]; then
  if [ -d "$ROOT/frontend" ]; then
    info "Starting frontend static server at http://0.0.0.0:9000 (serving ./frontend)"
    FRONT_LOG="$logdir/frontend.log"
    (cd "$ROOT/frontend" && nohup "$PYTHON" -m http.server 9000 > "$FRONT_LOG" 2>&1 &) 
    FRONT_PID=$(pgrep -f "python3 -m http.server 9000" || true)
    sleep 0.5
    info "Frontend PID(s)=$FRONT_PID, logs=$FRONT_LOG"
  else
    err "frontend directory not found; skipping frontend static server"
  fi
fi

info "Waiting briefly for services to initialize..."
sleep 1

# Health checks
info "Backend /status ->"
curl -sS http://127.0.0.1:8000/status || echo "(no response)"
if [ "$WITH_VOICE" -eq 1 ]; then
  info "Voice /health ->"
  curl -sS http://127.0.0.1:5000/health || echo "(no response)"
fi

info "Done. Access app at: http://127.0.0.1:9000 (frontend) and API at http://127.0.0.1:8000"

exit 0
