import { createHash } from "node:crypto";
import type { AISummary, Prisma, SummaryTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PROMPT_VERSION } from "@/lib/anthropic/prompts";

/**
 * Content-addressed cache key for an AISummary.
 *
 *   cacheKey = sha256(tier | nameWithOwner | sha | promptVersion)
 *
 * where `sha` is the tier-specific content hash:
 *   - METADATA  → Repository.readmeHash
 *   - DEEP_DIVE → HEAD commit SHA (Repository.headSha)
 *   - PROFILE   → hash(rounded metrics + member summary ids)
 *
 * An existing row with the same cacheKey means the Claude call can be skipped
 * entirely. Bump PROMPT_VERSION to invalidate every cached summary at once.
 */
export function cacheKey(
  tier: SummaryTier,
  nameWithOwner: string,
  sha: string,
  promptVersion: number = PROMPT_VERSION,
): string {
  return createHash("sha256")
    .update(`${tier}|${nameWithOwner}|${sha}|${promptVersion}`)
    .digest("hex");
}

/** Look up a cached summary by its unique cacheKey. Returns null on a miss. */
export function getCachedSummary(key: string): Promise<AISummary | null> {
  return prisma.aISummary.findUnique({ where: { cacheKey: key } });
}

export interface UpsertSummaryInput {
  tier: SummaryTier;
  cacheKey: string;
  model: string;
  inputHash: string;
  summaryMd: string;
  highlights?: Prisma.InputJsonValue | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  promptVersion?: number;
  // Scoping ids — repo-tier summaries (METADATA, DEEP_DIVE) leave userId null;
  // PROFILE sets userId and leaves repositoryId null.
  userId?: string | null;
  repositoryId?: string | null;
  organizationId?: string | null;
}

/**
 * Idempotently write a summary, keyed on the unique cacheKey. Re-running a job
 * with the same inputs overwrites the same row rather than creating duplicates.
 */
export function upsertSummary(row: UpsertSummaryInput): Promise<AISummary> {
  const data = {
    tier: row.tier,
    model: row.model,
    inputHash: row.inputHash,
    summaryMd: row.summaryMd,
    highlights: row.highlights ?? undefined,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    // Prisma Decimal accepts a JS number; null clears it.
    costUsd: row.costUsd ?? null,
    promptVersion: row.promptVersion ?? PROMPT_VERSION,
    userId: row.userId ?? null,
    repositoryId: row.repositoryId ?? null,
    organizationId: row.organizationId ?? null,
  };

  return prisma.aISummary.upsert({
    where: { cacheKey: row.cacheKey },
    create: { cacheKey: row.cacheKey, ...data },
    update: data,
  });
}

/**
 * Whether this user has hit their monthly deep-dive budget.
 *
 * DEEP_DIVE summaries are shared repo-tier rows (userId null), so we can't
 * attribute them by AISummary.userId. Instead we count DEEP_DIVE rows generated
 * this calendar month (UTC) for repositories this user is linked to — a stable
 * proxy for "deep-dives this user triggered". Used by both the web route
 * (pre-enqueue 429) and the worker (hard cost gate). Default budget is 5.
 */
export async function isDeepDiveBudgetExceeded(userId: string): Promise<boolean> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const budget = settings?.deepDiveBudget ?? 5;
  if (budget <= 0) return true;

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const links = await prisma.userRepository.findMany({
    where: { userId },
    select: { repositoryId: true },
  });
  const repositoryIds = links.map((l) => l.repositoryId);
  if (repositoryIds.length === 0) return false;

  const used = await prisma.aISummary.count({
    where: {
      tier: "DEEP_DIVE",
      repositoryId: { in: repositoryIds },
      generatedAt: { gte: monthStart },
    },
  });
  return used >= budget;
}

/** Stable sha256 over an arbitrary JSON-able value (sorted keys for determinism). */
export function hashJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
