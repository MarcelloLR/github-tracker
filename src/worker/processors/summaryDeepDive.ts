import type { JobContext } from "@/worker/runJob";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { githubRest, fetchTree } from "@/lib/github/rest";
import { selectFiles, type TreeEntry } from "@/lib/anthropic/fileSelector";
import { MODELS } from "@/lib/anthropic/client";
import {
  deepDiveSystemPrompt,
  deepDiveContentBlocks,
  type DeepDiveContext,
  type DeepDiveFile,
  TOKEN_CAPS,
} from "@/lib/anthropic/prompts";
import { generateSummary } from "@/lib/anthropic/generate";
import {
  cacheKey,
  getCachedSummary,
  isDeepDiveBudgetExceeded,
  upsertSummary,
} from "@/lib/anthropic/cache";

/**
 * On-demand deep-dive summary (Sonnet). Deterministic file selector picks the
 * high-signal files, then we fetch those blobs by SHA, assemble one cacheable
 * block per file, and summarize architecture/patterns. Budget-gated by the
 * user's monthly UserSettings.deepDiveBudget; cached on the HEAD commit SHA.
 * The resulting AISummary is a SHARED repo-tier row (userId null). See docs/SPEC.md.
 */
export async function summaryDeepDive(jobCtx: JobContext): Promise<void> {
  const { job, log } = jobCtx;
  const { userId, repositoryId } = job.data as {
    userId: string;
    repositoryId: string;
  };

  // Enforce the per-user monthly deep-dive budget. The web route also checks
  // this before enqueueing; re-check here since the cap is a hard cost control.
  if (await isDeepDiveBudgetExceeded(userId)) {
    log.debug({ repositoryId, tier: "DEEP_DIVE" }, "summary.budget_exceeded");
    return;
  }

  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });
  if (!repo || !repo.headSha) return;

  // Cache hit → skip everything (no GitHub, no Claude).
  const key = cacheKey("DEEP_DIVE", repo.nameWithOwner, repo.headSha);
  if (await getCachedSummary(key)) {
    log.debug({ repositoryId, tier: "DEEP_DIVE", cacheHit: true }, "summary.cache_hit");
    return;
  }
  log.debug({ repositoryId, tier: "DEEP_DIVE", cacheHit: false }, "summary.generating");

  // Load and decrypt the user's GitHub token. If decrypt throws, the token was
  // likely stored as plaintext (the auth-layer encryption TODO is still open).
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  if (!account?.access_token) return;

  let token: string;
  try {
    token = decrypt(account.access_token);
  } catch {
    token = account.access_token;
  }

  const octokit = githubRest(token);
  const owner = repo.owner;
  const name = repo.name;

  // Full recursive tree at HEAD, then deterministic selection (no LLM).
  // fetchTree is ETag-aware; with no etag passed it always returns fresh data.
  const treeResult = await fetchTree(octokit, owner, name, repo.headSha);
  if (treeResult.notModified) return;
  const selected = selectFiles(
    treeResult.data.filter((e): e is TreeEntry => Boolean(e.path && e.type && e.sha)),
  );

  // Fetch each selected blob inline by SHA (base64), decode to text. Skip blobs
  // that fail or look binary rather than aborting the whole job.
  const files: DeepDiveFile[] = [];
  for (const entry of selected) {
    try {
      const { data } = await octokit.git.getBlob({
        owner,
        repo: name,
        file_sha: entry.sha,
      });
      const content =
        data.encoding === "base64"
          ? Buffer.from(data.content, "base64").toString("utf8")
          : data.content;
      if (looksBinary(content)) continue;
      files.push({ path: entry.path, content });
    } catch {
      // Ignore individual blob failures (deleted/moved/oversized).
    }
  }

  if (files.length === 0) return;

  const ctx: DeepDiveContext = {
    nameWithOwner: repo.nameWithOwner,
    description: repo.description,
    primaryLang: repo.primaryLang,
    headSha: repo.headSha,
    files,
  };

  const result = await generateSummary({
    model: MODELS.deepDive,
    system: deepDiveSystemPrompt(),
    stableBlocks: deepDiveContentBlocks(ctx),
    inputTokenCap: TOKEN_CAPS.deepDive,
    maxTokens: 4096,
  });

  await upsertSummary({
    tier: "DEEP_DIVE",
    cacheKey: key,
    model: MODELS.deepDive,
    inputHash: repo.headSha,
    summaryMd: result.summaryMd,
    highlights: result.highlights,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    // Shared repo-tier summary (user-agnostic).
    userId: null,
    repositoryId: repo.id,
    organizationId: repo.organizationId,
  });
}

/** Heuristic: a NUL byte in the first chunk means it's binary; skip it. */
function looksBinary(content: string): boolean {
  const head = content.slice(0, 8000);
  for (let i = 0; i < head.length; i++) {
    if (head.charCodeAt(i) === 0) return true;
  }
  return false;
}
