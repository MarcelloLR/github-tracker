#!/usr/bin/env bash
#
# Bring up the full github-tracker dev stack:
#   .env (auto-created + local secrets generated) -> Postgres + Redis (Docker)
#   -> deps -> Prisma schema -> web (:3000) + BullMQ worker.
#
# Usage:
#   ./scripts/dev-up.sh               # set everything up, then run web + worker (Ctrl-C stops both)
#   SETUP_ONLY=1 ./scripts/dev-up.sh  # only set up infra/schema; start the processes yourself
#
# Tear down infra with ./scripts/dev-down.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_NAME="${PG_NAME:-gt-pg}"
REDIS_NAME="${REDIS_NAME:-gt-redis}"

log()  { printf '\033[1;34m[dev-up]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev-up]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[dev-up]\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  log "creating .env from .env.example"
  cp .env.example .env
fi

# Fill the two locally-generated secrets if they're blank (32 random bytes, base64).
ensure_local_secret() {
  local key="$1" cur val
  cur="$(grep -E "^${key}=" .env | head -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//" || true)"
  if [ -z "$cur" ]; then
    val="$(openssl rand -base64 32)"
    if grep -qE "^${key}=" .env; then
      sed -i.bak -E "s|^${key}=.*|${key}=\"${val}\"|" .env && rm -f .env.bak
    else
      printf '%s="%s"\n' "$key" "$val" >> .env
    fi
    log "generated ${key}"
  fi
}
ensure_local_secret AUTH_SECRET
ensure_local_secret TOKEN_ENCRYPTION_KEY

# Warn about the values only you can supply (sign-in / AI won't work until set).
missing=()
for k in AUTH_GITHUB_ID AUTH_GITHUB_SECRET ANTHROPIC_API_KEY; do
  v="$(grep -E "^${k}=" .env | head -1 | sed -E "s/^${k}=//; s/^\"//; s/\"$//" || true)"
  [ -z "$v" ] && missing+=("$k")
done
if [ "${#missing[@]}" -gt 0 ]; then
  warn "still empty in .env (needed for sign-in / AI summaries): ${missing[*]}"
  warn "  GitHub OAuth app -> https://github.com/settings/developers"
  warn "    callback URL: http://localhost:3000/api/auth/callback/github"
  warn "  Anthropic key  -> https://console.anthropic.com"
fi

# --- 2. Postgres + Redis (Docker) -------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker not found — install Docker Desktop"
docker info >/dev/null 2>&1 || die "docker daemon not running — start Docker Desktop"

start_container() {
  local name="$1"; shift
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    log "$name already running"
  elif docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    log "starting existing $name"; docker start "$name" >/dev/null
  else
    log "creating $name"; docker run -d --name "$name" "$@" >/dev/null
  fi
}

start_container "$PG_NAME" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=github_tracker \
  -p 5432:5432 postgres:16-alpine
start_container "$REDIS_NAME" -p 6379:6379 redis:7-alpine

log "waiting for Postgres to accept connections..."
for _ in $(seq 1 30); do
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 || die "Postgres never became ready"
docker exec "$REDIS_NAME" redis-cli ping >/dev/null 2>&1 || die "Redis not responding"
log "Postgres + Redis up"

# --- 3. deps + schema --------------------------------------------------------
if [ ! -d node_modules ]; then log "installing deps (npm install)"; npm install; fi
log "syncing Prisma schema (prisma db push)"
npx prisma db push   # auto-loads .env

# --- 4. run web + worker -----------------------------------------------------
if [ -n "${SETUP_ONLY:-}" ]; then
  log "setup complete (SETUP_ONLY set). Start the app yourself with:"
  log "  npm run dev      # web on http://localhost:3000"
  log "  npm run worker   # BullMQ worker"
  exit 0
fi

log "starting web (http://localhost:3000) + worker — Ctrl-C stops both"
pids=()
npm run dev    & pids+=("$!")
npm run worker & pids+=("$!")
trap 'echo; log "stopping web + worker"; kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; exit 0' INT TERM
wait
