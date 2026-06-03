# Github Tracker (OSTrack) — Spec

## Context

This spec expands the README's vision in three directions:
1. **Per-repo and per-(public)-organization** detail + statistics views.
2. Richer **statistics on the user's own contributions**.
3. **AI summaries** — of the codebases they contribute to, and of their overall developer profile.

The outcome is a buildable spec for an MVP plus a phasing plan, honoring the README's committed stack.

### Confirmed decisions
- **Stack (from README):** Next.js (App Router) full-stack · PostgreSQL + Prisma · NextAuth.js (GitHub OAuth) · BullMQ + Redis for background sync · Recharts · Fly.io.
- **Audience:** multi-user product. Each user signs in with their own GitHub OAuth token; data is isolated per user; GitHub rate limits respected per-token.
- **Coverage:** only repos/orgs the user **contributes to**, auto-discovered from commits/PRs/reviews/issues. Org views aggregate the user's contributions within that org.
- **AI = Claude API** (Anthropic SDK, prompt caching). Two codebase-summary tiers: cheap **metadata** by default, on-demand **deep-dive** that reads source. Plus a **profile** summary.

---

## Architecture

Three runtime roles, one Postgres, one Redis. **Core principle: the request path never calls GitHub or Claude.** Pages read pre-computed data from Postgres; mutations enqueue jobs and the UI polls job status.

1. **Web (Next.js)** — pages (Server Components read Prisma directly), NextAuth, API routes/server actions.
2. **Worker (BullMQ)** — separate Fly process group; all GitHub + Claude calls live here. Queues: `discover`, `sync-repo`, `compute-stats`, `summary-metadata`, `summary-deepdive`, `summary-profile`.
3. **Scheduler** — BullMQ repeatable jobs enqueue per-user incremental sync ~every 3h, staggered.

---

## GitHub ingestion (GraphQL-first)

GraphQL v4 is primary (its limit is query-*cost*, not request count, and it collapses dozens of REST calls). REST only where GraphQL is weak.

- **Discover repos/orgs + per-repo contribution counts + daily calendar:** one `user.contributionsCollection` query (`commit/pullRequest/pullRequestReview/issueContributionsByRepository` + `contributionCalendar`).
- **PR/issue/review detail** (state, `createdAt`/`mergedAt`/`closedAt`, additions/deletions, review count): GraphQL `search(type: ISSUE, query:"author:USER …")` / `reviewed-by:USER`.
- **Commits / timeline:** `repository.defaultBranchRef.target.history(author:{id})`.
- **Languages / metadata / README / topics:** `repository.languages` + `object(expression:"HEAD:README.md")` + topics/stars/license/pushedAt.
- **File tree (REST):** `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` — one call, full tree + sizes.
- **Source blobs (REST, deep-dive only):** fetch the ~15–25 selected files by SHA (content-hashable for cache).

**Rate-limit strategy:** request `rateLimit{cost remaining resetAt}` in every GraphQL query; persist on `SyncState`. Worker uses a per-`userId` token-bucket gate + BullMQ group limiter; when `remaining < floor`, `moveToDelayed` until `resetAt`. ETags on REST tree/file calls so unchanged data returns `304` (no quota cost). Honor `Retry-After` / secondary-limit backoff.

**Sync model (per-user, staged, incremental, idempotent via upsert on GitHub node IDs):**
1. `discover` — `contributionsCollection` since `lastSync - overlap`; upsert repos/orgs + `UserRepository` links; enqueue `sync-repo` only for repos whose `pushedAt`/counts changed (skip-untouched is the main cost saver).
2. `sync-repo` — pull PRs/reviews/issues/commits since the repo's per-user cursor; upsert `Contribution` facts; refresh languages/metadata via ETag.
3. `compute-stats` — recompute rollups (DB-only, fast).
4. summary jobs — only when inputs changed (README hash / new HEAD SHA).

**Freshness:** ~3h background refresh + manual **"Refresh now"** (debounced, high-priority). First login backfills trailing **12 months** immediately, deeper history queued low-priority. UI always shows `lastSyncedAt`.

---

## Data model (Prisma) — key models

- **NextAuth:** `User`, `Account` (holds GitHub OAuth `access_token` — **encrypted at app layer**, see Risks), `Session`, `VerificationToken`.
- **Shared GitHub entities (across users):** `Organization`, `Repository` (with `readmeHash`, `pushedAt`, `defaultBranch`, `topics`), `RepoLanguage` (bytes per language). Sharing these means two users contributing to the same repo share one metadata/deep-dive summary → big cost saving.
- **Per-user links (isolation + cursors):** `UserRepository` (`firstContributedAt`, `lastContributedAt`, `lastSyncedAt`, `syncCursor` JSON), `UserOrganization`.
- **Contribution facts:** `Contribution` — one row per PR/review/issue/commit-day. Fields: `type` (`PR_OPENED|PR_MERGED|REVIEW|ISSUE_OPENED|COMMIT`), `state`, `additions/deletions`, `reviewCount`, `createdAt/mergedAt/closedAt`, **`cycleTimeSec`** (persisted for fast percentiles), `occurredOn` (date bucket). Unique `(userId,type,githubNodeId)`; indexed `(userId,occurredOn)` and `(userId,repositoryId,type)`.
- **Time-series rollups:** `StatSnapshot` — one narrow row per `(user, scope, scopeId, date)` at `scope ∈ {GLOBAL,REPO,ORG}` with daily `prsOpened/prsMerged/reviews/issuesOpened/commits/additions/deletions`. Charts = one indexed range scan; weekly/monthly roll up trivially.
- **AI:** `AISummary` — `tier (METADATA|DEEP_DIVE|PROFILE)`, optional `userId`(profile)/`repositoryId`, **`cacheKey` unique**, `model`, `inputHash`, `summaryMd`, `highlights` JSON, token/cost fields, `promptVersion`, `generatedAt`. Repo-tier summaries are user-agnostic (`userId` null).
- **Ops/product:** `SyncState` (status, rate remaining/reset, lastError), `UserSettings` (`syncIntervalHrs`, `deepDiveBudget`, `portfolioPublic`, `publicSlug`).

**Invariant:** all per-user data lives in `Contribution`/`UserRepository`/`UserOrganization`; never write per-user data onto shared `Repository`/`Organization` rows. Worth an explicit test.

---

## Metrics (computed from facts/rollups — no GitHub calls at read time)

- **Per-repo:** PRs opened, PRs merged, **merge rate**, **PR cycle-time p50/p90** (from `cycleTimeSec`), reviews given, issues opened, commits, code churn / avg PR size, language mix (RepoLanguage %), contribution timeline (StatSnapshot), first/last contribution.
- **Per-org:** same set summed across the org's repos + top-repos-within-org breakdown + byte-weighted org language mix.
- **Global / profile:** all-time + windowed totals; **active streak** (user-defined consecutive periods with ≥1 qualifying contribution — distinct from GitHub's heatmap); cross-repo consistency/engagement (distinct repos/orgs active per period); global cycle-time percentiles + merge rate; contribution calendar; top languages overall.

Percentiles via SQL `percentile_cont` or JS over a windowed fetch; streaks in JS over ordered snapshots.

---

## Claude API summary pipeline (worker-only)

Anthropic SDK with `cache_control: ephemeral` on large stable blocks. Three jobs → `AISummary`.

- **Metadata (default, cheap) — Haiku:** context from DB only (README truncated, topics, language mix, top-level file-tree summary, last ~30 commit messages, stars/desc/license). Generated on repo discovery and whenever `readmeHash`/lang/topics change.
- **Deep-dive (on-demand) — Sonnet** (Opus only on explicit opt-in, budget-gated): a **deterministic file selector** (no LLM) picks entrypoints + high-signal files from the tree (root config, `src/index|main`, module dirs, largest non-vendored source, routing/schema), capped at ~15–25 files / ~60–80k tokens; skip lockfiles/generated/vendor/binaries. Fetch blobs by SHA, one cacheable block per file. Summarizes architecture/patterns.
- **Profile — Sonnet:** context = computed global metrics + top repos/orgs reusing already-generated metadata-summary highlights (no re-fetch). Produces the profile narrative + portfolio blurb.

**Caching & cost controls:** DB cache skips the call entirely — `cacheKey = sha256(tier | nameWithOwner | sha | promptVersion)` where `sha` = readmeHash (metadata) / HEAD commit SHA (deep-dive) / hash(rounded metrics + member summary ids) (profile); bump `promptVersion` to invalidate. Prompt caching on stable blocks + shared repo summaries → high cache-hit rate. Hard input-token caps per tier; record tokens/cost; enforce per-user monthly `deepDiveBudget`; throttle profile regen to material metric changes.

---

## App structure

> All application source lives under `src/` (e.g. `src/app`, `src/components`, `src/lib`, `src/worker`, `src/types`); the `@/*` import alias maps to `./src/*`. Paths below are shown relative to `src/`. Config (`package.json`, `next.config.mjs`, `tsconfig.json`), plus `prisma/`, `docs/`, and `scripts/`, stay at the repo root.

```
app/(marketing)/page.tsx                      landing + Sign in with GitHub
app/(app)/dashboard/page.tsx                  global stats, calendar, streaks, top repos/orgs
app/(app)/repos/page.tsx                       contributed-repo list
app/(app)/repos/[owner]/[name]/page.tsx        repo detail: metrics, charts, metadata summary, "Deep dive" btn
app/(app)/orgs/[login]/page.tsx                org aggregation view
app/(app)/profile/page.tsx                     AI profile summary + headline metrics
app/(app)/settings/page.tsx                    sync interval, deep-dive budget, portfolio toggle
app/p/[slug]/page.tsx                          PUBLIC portfolio export (no auth; if portfolioPublic)
app/api/auth/[...nextauth]/route.ts            NextAuth GitHub provider
app/api/sync/route.ts                          POST enqueue "Refresh now" (debounced)
app/api/jobs/[id]/route.ts                     GET job/sync status (UI polls)
app/api/repos/[id]/deep-dive/route.ts          POST enqueue deep-dive (budget-checked)
app/actions/*                                  server actions: updateSettings, togglePortfolio
worker/index.ts, worker/queues.ts, worker/processors/*   BullMQ worker (separate Fly process)
lib/github/{graphql,rest,rateLimit}.ts
lib/anthropic/{client,prompts,fileSelector}.ts
lib/metrics/{compute,streaks,percentiles}.ts
lib/{db,auth,crypto}.ts
prisma/schema.prisma
```

Server Components read Prisma directly; server actions for settings; API routes for poll-able actions (sync, deep-dive) returning a job id.

---

## Phasing

**MVP (core loop):** GitHub OAuth + encrypted tokens · discover + incremental GraphQL sync · 12-month backfill · ~3h refresh + "Refresh now" with job polling · core per-repo/org/global metrics + StatSnapshot + Recharts · metadata (Haiku) + profile (Sonnet) summaries · user-defined streaks · dashboard/repo/org/profile/settings pages.

**Phase 2:** on-demand deep-dive (Sonnet/Opus + budget) · public portfolio export `/p/[slug]` · deeper history backfill, percentile caching, richer charts.

**Phase 3 (README roadmap):** multi-account (Account already supports it) · webhook real-time sync (GitHub App → targeted `sync-repo`) · weekly email digest · team comparison view.

---

## Key risks / tradeoffs

- **GitHub rate limits (top risk):** GraphQL-first, per-user token-bucket + group limiter, ETags, skip-untouched repos, staggered schedules, `moveToDelayed` until `resetAt`. Heavy users get paced low-priority backfill.
- **Deep-dive cost/latency:** deterministic selector with hard caps, content-hash DB cache shared across users, prompt caching, monthly budget, Sonnet-default/Opus-opt-in.
- **Staleness:** polling ⇒ ≤3h stale; "Refresh now" covers urgency; webhooks (Phase 3) close it; always surface `lastSyncedAt`.
- **OAuth token secrecy:** AES-GCM encrypt `Account.access_token` (key from Fly secrets), decrypt only in worker/auth, never to client/logs; minimal scopes (`read:user`, `public_repo`; private only if in scope); flag `SyncState.ERROR` + prompt re-login on revoke.
- **Shared-vs-isolated correctness:** keep per-user facts strictly out of shared rows (invariant + test).
- **Two-process deploy:** web + worker as separate Fly process groups sharing Redis/Prisma config — required so external latency never blocks the web tier.

---

## Verification (when built)

- **Unit:** metric calculators (`lib/metrics/*`) against fixture `Contribution` sets — merge rate, cycle-time percentiles, streaks; file-selector heuristics against a sample tree.
- **Integration:** mock GitHub GraphQL/REST → run `discover`→`sync-repo`→`compute-stats`; assert upsert idempotency (re-run with overlap window leaves no dupes) and per-user isolation invariant.
- **AI:** assert cache-hit path (same `cacheKey` ⇒ no Claude call) and token-cap truncation; smoke a real metadata summary against one public repo.
- **E2E (manual):** `npm run dev` + worker, sign in with GitHub, confirm dashboard populates within minutes, repo/org/profile pages render charts + summaries, "Deep dive" enqueues and completes, "Refresh now" updates `lastSyncedAt`, rate-limit gate trips gracefully under a low floor.
