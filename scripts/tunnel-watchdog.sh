#!/usr/bin/env bash
# Keeps the dev game server reachable from the deployed frontend.
# If the server or the quick tunnel dies, both are restarted; when the tunnel URL
# changes, client/public/config.json is updated and pushed so the live site follows.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$REPO/client/public/config.json"
CLOUDFLARED="${CLOUDFLARED:-/tmp/cloudflared}"
PORT="${PORT:-3001}"
SERVER_LOG=/tmp/game-server.log
TUNNEL_LOG=/tmp/cf-server.log

log() { echo "[watchdog $(date -u +%H:%M:%S)] $*"; }

server_up() {
  curl -sf --max-time 5 "http://127.0.0.1:$PORT/health" >/dev/null
}

start_server() {
  log "starting game server on :$PORT"
  (cd "$REPO" && PORT="$PORT" HOST=0.0.0.0 MIN_PLAYERS=1 ALLOW_BOTS=true \
    nohup node server/dist/index.js >"$SERVER_LOG" 2>&1 &)
  sleep 4
}

tunnel_url() {
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1
}

start_tunnel() {
  pkill -f 'cloudflared tunnel --url' 2>/dev/null
  : >"$TUNNEL_LOG"
  log "starting cloudflare quick tunnel"
  (nohup "$CLOUDFLARED" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate \
    >"$TUNNEL_LOG" 2>&1 &)
  for _ in $(seq 1 20); do
    sleep 2
    [ -n "$(tunnel_url)" ] && return 0
  done
  return 1
}

publish() {
  local url="$1"
  local ws="wss://${url#https://}"
  local current
  current="$(grep -oE 'wss://[^"]+' "$CONFIG" 2>/dev/null || true)"
  [ "$current" = "$ws" ] && return 0

  log "publishing new server url: $ws"
  printf '{\n  "serverUrl": "%s"\n}\n' "$ws" >"$CONFIG"
  (cd "$REPO" &&
    git add "$CONFIG" &&
    git commit -q -m "chore: point client at current game server tunnel" &&
    git push -q origin HEAD) && log "pushed; Vercel will redeploy" || log "push failed"
}

tunnel_ok() {
  local url="$1"
  [ -n "$url" ] || return 1
  curl -sf --max-time 10 "$url/health" >/dev/null
}

while true; do
  server_up || start_server

  url="$(tunnel_url)"
  if ! tunnel_ok "$url"; then
    if start_tunnel; then
      url="$(tunnel_url)"
      publish "$url"
    else
      log "tunnel failed to come up, retrying"
      sleep 15
      continue
    fi
  fi

  sleep 30
done
