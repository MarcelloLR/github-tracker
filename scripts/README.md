# scripts

Local dev helpers for the github-tracker stack (Next.js web + BullMQ worker + Postgres + Redis).

## `dev-up.sh` — bring the whole stack up

```bash
./scripts/dev-up.sh
```

1. Creates `.env` from `.env.example` if missing, and generates the two locally-derived
   secrets `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` (32 random bytes each).
2. Starts Postgres + Redis in Docker (containers `gt-pg`, `gt-redis`) and waits for them.
3. Installs deps if `node_modules` is missing, then syncs the Prisma schema (`prisma db push`).
4. Runs the web tier (http://localhost:3000) and the worker. **Ctrl-C stops both.**

Before you can **sign in / generate AI summaries**, fill three values in `.env`
(the script prints a reminder if they're blank):

| Var | Where |
|-----|-------|
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | A GitHub **OAuth App** — https://github.com/settings/developers — callback URL `http://localhost:3000/api/auth/callback/github` |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |

Set up infra + schema **without** launching the long-running processes (e.g. to run them
in separate terminals, or in CI):

```bash
SETUP_ONLY=1 ./scripts/dev-up.sh
```

## `dev-down.sh` — tear it down

```bash
./scripts/dev-down.sh
```

Stops the web/worker processes and removes the `gt-pg` / `gt-redis` containers. Your `.env`
is left alone. (No named volume, so the database resets — `dev-up.sh` re-creates the schema.)

## First run

Open http://localhost:3000 → **Sign in with GitHub** → on the dashboard click **Refresh now**
to enqueue your first sync (`discover → sync-repo → compute-stats → summaries`). Watch the
worker terminal for progress; the dashboard/repos/profile pages populate within a minute or two.
