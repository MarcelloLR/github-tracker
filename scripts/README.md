# scripts

`dev.sh` — one script to run the github-tracker dev stack: Postgres + Redis (Docker)
plus the Next.js web tier (:3000) and the BullMQ worker (managed as background processes).

```bash
./scripts/dev.sh start            # .env + infra + schema, then web + worker
./scripts/dev.sh start worker     # one service (brings up infra + schema first)
./scripts/dev.sh restart worker   # restart one service
./scripts/dev.sh stop             # stop everything (web, worker, containers)
./scripts/dev.sh stop web         # stop one service
./scripts/dev.sh status           # what's up
./scripts/dev.sh logs worker      # follow a service log (Ctrl-C to stop following)
```

**Targets:** `all` (default) · `web` · `worker` · `db` · `redis` · `infra` (= db + redis).

What `start` does, idempotently:
1. Creates `.env` from `.env.example` if missing and generates the two local secrets
   (`AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`).
2. Starts Postgres + Redis (`gt-pg`, `gt-redis`) and waits for them.
3. Syncs the Prisma schema (`prisma db push`).
4. Launches web + worker in the background; logs + pidfiles live in `.dev/` (gitignored).

`stop` kills the background processes and (for `all`/`infra`/`db`/`redis`) removes the
containers. No named volume, so stopping the DB resets it — the next `start` re-creates the
schema.

## Before sign-in

Fill three values in `.env` (the script reminds you each run while they're blank):

| Var | Where |
|-----|-------|
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub **OAuth App** — https://github.com/settings/developers — callback `http://localhost:3000/api/auth/callback/github` |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |

## First run

```bash
./scripts/dev.sh start
```

Then open http://localhost:3000 → **Sign in with GitHub** → on the dashboard click
**Refresh now** to enqueue your first sync (`discover → sync-repo → compute-stats →
summaries`). Follow progress with `./scripts/dev.sh logs worker`.
