#!/usr/bin/env bash
# Run the github-tracker dev stack: Postgres + Redis (Docker) plus the Next.js
# web tier (:3000) and the BullMQ worker (managed as background processes).
# Run from anywhere; it cd's to the repo root.
#
#   ./scripts/dev.sh start            # .env + infra + schema, then web + worker
#   ./scripts/dev.sh start worker     # one service (brings up infra + schema first)
#   ./scripts/dev.sh restart worker   # restart one service
#   ./scripts/dev.sh stop             # stop everything (web, worker, containers)
#   ./scripts/dev.sh stop web         # stop one service
#   ./scripts/dev.sh status           # what's up
#   ./scripts/dev.sh logs worker      # follow a service log
#
# Targets: all (default) | web | worker | db | redis | infra
#   web -> next dev   worker -> BullMQ worker   db -> gt-pg   redis -> gt-redis
#   infra -> db + redis
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_NAME="${PG_NAME:-gt-pg}"
REDIS_NAME="${REDIS_NAME:-gt-redis}"
DEV_DIR="$ROOT/.dev"
mkdir -p "$DEV_DIR/logs"

c_blue='\033[1;34m'; c_yellow='\033[1;33m'; c_red='\033[1;31m'; c_off='\033[0m'
log()  { printf "${c_blue}[dev]${c_off} %s\n" "$*"; }
warn() { printf "${c_yellow}[dev]${c_off} %s\n" "$*" >&2; }
die()  { printf "${c_red}[dev]${c_off} %s\n" "$*" >&2; exit 1; }
usage() { sed -n '2,20p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'; exit 2; }

# --- .env -------------------------------------------------------------------
ensure_local_secret() {
  local key="$1" cur val
  cur="$(grep -E "^${key}=" .env | head -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
  if [ -z "$cur" ]; then
    val="$(openssl rand -base64 32)"
    if grep -qE "^${key}=" .env; then sed -i.bak -E "s|^${key}=.*|${key}=\"${val}\"|" .env && rm -f .env.bak
    else printf '%s="%s"\n' "$key" "$val" >> .env; fi
    log "generated ${key}"
  fi
}
ensure_env() {
  if [ ! -f .env ]; then log "creating .env from .env.example"; cp .env.example .env; fi
  ensure_local_secret AUTH_SECRET
  ensure_local_secret TOKEN_ENCRYPTION_KEY
  local missing=() k v
  for k in AUTH_GITHUB_ID AUTH_GITHUB_SECRET ANTHROPIC_API_KEY; do
    v="$(grep -E "^${k}=" .env | head -1 | sed -E "s/^${k}=//; s/^\"//; s/\"$//" || true)"
    [ -z "$v" ] && missing+=("$k")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    warn "still empty in .env (needed for sign-in / AI): ${missing[*]}"
    warn "  GitHub OAuth app -> https://github.com/settings/developers"
    warn "    callback URL: http://localhost:3000/api/auth/callback/github"
    warn "  Anthropic key  -> https://console.anthropic.com"
  fi
}

# --- docker infra -----------------------------------------------------------
require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker not found — install Docker Desktop"
  docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker Desktop"
}
container_running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }
container_exists()  { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }
start_db() {
  require_docker
  if container_running "$PG_NAME"; then log "$PG_NAME already running"
  elif container_exists "$PG_NAME"; then log "starting $PG_NAME"; docker start "$PG_NAME" >/dev/null
  else log "creating $PG_NAME"; docker run -d --name "$PG_NAME" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=github_tracker \
    -p 5432:5432 postgres:16-alpine >/dev/null; fi
  log "waiting for Postgres..."
  local i
  for i in $(seq 1 30); do docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 || die "Postgres never became ready"
}
start_redis() {
  require_docker
  if container_running "$REDIS_NAME"; then log "$REDIS_NAME already running"
  elif container_exists "$REDIS_NAME"; then log "starting $REDIS_NAME"; docker start "$REDIS_NAME" >/dev/null
  else log "creating $REDIS_NAME"; docker run -d --name "$REDIS_NAME" -p 6379:6379 redis:7-alpine >/dev/null; fi
  docker exec "$REDIS_NAME" redis-cli ping >/dev/null 2>&1 || die "Redis not responding"
}
stop_db()    { require_docker; log "removing $PG_NAME";    docker rm -f "$PG_NAME"    >/dev/null 2>&1 || true; }
stop_redis() { require_docker; log "removing $REDIS_NAME"; docker rm -f "$REDIS_NAME" >/dev/null 2>&1 || true; }
ensure_schema() {
  log "syncing Prisma schema (prisma db push)"
  npx prisma db push >/dev/null 2>&1 && log "schema in sync" || die "prisma db push failed (is Postgres up?)"
}

# --- background node processes ----------------------------------------------
proc_pid()     { cat "$DEV_DIR/$1.pid" 2>/dev/null || true; }  # never fail (set -e safe)
proc_running() { local p; p="$(proc_pid "$1")"; [ -n "$p" ] && kill -0 "$p" 2>/dev/null; }
start_proc() { # name  ready-grep  cmd...
  local name="$1" ready="$2"; shift 2
  if proc_running "$name"; then log "$name already running (pid $(proc_pid "$name"))"; return; fi
  log "starting $name"
  nohup "$@" >"$DEV_DIR/logs/$name.log" 2>&1 &
  echo "$!" > "$DEV_DIR/$name.pid"
  local i
  for i in $(seq 1 45); do
    grep -q "$ready" "$DEV_DIR/logs/$name.log" 2>/dev/null && break
    proc_running "$name" || break
    sleep 1
  done
  if proc_running "$name" && grep -q "$ready" "$DEV_DIR/logs/$name.log" 2>/dev/null; then
    log "$name up (pid $(proc_pid "$name")) — logs: .dev/logs/$name.log"
  else
    warn "$name did not report ready — see .dev/logs/$name.log"
    tail -15 "$DEV_DIR/logs/$name.log" 2>/dev/null >&2 || true
  fi
}
stop_proc() { # name  pkill-pattern
  local name="$1" pat="$2" p
  p="$(proc_pid "$name")"
  [ -n "$p" ] && { log "stopping $name (pid $p)"; kill "$p" 2>/dev/null || true; }
  [ -n "$pat" ] && pkill -f "$pat" 2>/dev/null || true
  rm -f "$DEV_DIR/$name.pid"
}
start_web()    { ensure_env; start_db; start_redis; ensure_schema; start_proc web "Ready in" npm run dev; log "web -> http://localhost:3000"; }
start_worker() { ensure_env; start_db; start_redis; ensure_schema; start_proc worker "worker.started" npm run worker; }
stop_web()     { stop_proc web "next dev"; }
stop_worker()  { stop_proc worker "tsx watch src/worker/index.ts"; }

# --- status / logs ----------------------------------------------------------
status() {
  printf "github-tracker dev status\n"
  local s c
  for s in web worker; do
    if proc_running "$s"; then printf "  %-9s running (pid %s)\n" "$s" "$(proc_pid "$s")"
    else printf "  %-9s stopped\n" "$s"; fi
  done
  for c in "$PG_NAME" "$REDIS_NAME"; do
    if container_running "$c"; then printf "  %-9s running\n" "$c"; else printf "  %-9s stopped\n" "$c"; fi
  done
}
do_logs() {
  local t="$1"
  case "$t" in web|worker) : ;; *) die "logs target must be web or worker" ;; esac
  local f="$DEV_DIR/logs/$t.log"
  [ -f "$f" ] || die "no log at $f (is $t running?)"
  tail -f "$f"
}

# --- dispatch ---------------------------------------------------------------
start_target() {
  case "$1" in
    all)    ensure_env; start_db; start_redis; ensure_schema
            start_proc web "Ready in" npm run dev
            start_proc worker "worker.started" npm run worker
            log "web -> http://localhost:3000" ;;
    web)    start_web ;;
    worker) start_worker ;;
    db)     start_db ;;
    redis)  start_redis ;;
    infra)  start_db; start_redis ;;
    *)      die "unknown target: $1 (use all|web|worker|db|redis|infra)" ;;
  esac
}
stop_target() {
  case "$1" in
    all)    stop_web; stop_worker; stop_db; stop_redis ;;
    web)    stop_web ;;
    worker) stop_worker ;;
    db)     stop_db ;;
    redis)  stop_redis ;;
    infra)  stop_db; stop_redis ;;
    *)      die "unknown target: $1 (use all|web|worker|db|redis|infra)" ;;
  esac
}

ACTION="${1:-}"; TARGET="${2:-all}"
[ -z "$ACTION" ] && usage
case "$ACTION" in
  start)          start_target "$TARGET" ;;
  stop)           stop_target "$TARGET" ;;
  restart)        stop_target "$TARGET"; start_target "$TARGET" ;;
  status)         status ;;
  logs)           do_logs "$TARGET" ;;
  -h|--help|help) usage ;;
  *)              usage ;;
esac
