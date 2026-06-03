#!/usr/bin/env bash
#
# Tear down the github-tracker dev stack started by dev-up.sh:
# stop the web/worker processes and remove the Postgres/Redis containers.
# Leaves your .env untouched. Removing the Postgres container drops its data
# (no named volume) — the next dev-up re-creates the schema via `prisma db push`.
set -uo pipefail

PG_NAME="${PG_NAME:-gt-pg}"
REDIS_NAME="${REDIS_NAME:-gt-redis}"

log() { printf '\033[1;34m[dev-down]\033[0m %s\n' "$*"; }

log "stopping web + worker (if running)"
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx watch worker/index.ts" 2>/dev/null || true

log "removing containers: $PG_NAME $REDIS_NAME"
docker rm -f "$PG_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true

log "done"
