// Bump PROMPT_VERSION to invalidate every cached AISummary at once.
export const PROMPT_VERSION = 1;

// ---------------------------------------------------------------------------
// Token budgeting
//
// We don't run a real tokenizer in the worker (the Anthropic SDK's
// count_tokens is a network call). Instead we hard-truncate on a conservative
// chars-per-token estimate so a pathological README / source file can never
// blow the per-tier input cap. ~3.5 chars/token is deliberately pessimistic so
// the byte budget always under-counts the real token budget.
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 3.5;

/** Hard cap a string to `maxTokens` worth of characters (best-effort estimate). */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n…[truncated to fit the ${maxTokens}-token cap]`;
}

// Per-tier hard input-token caps. The generator enforces these on the assembled
// prompt; these constants bound individual large blocks before assembly.
export const TOKEN_CAPS = {
  metadata: 12_000, // DB-only context — cheap Haiku tier
  metadataReadme: 6_000, // README slice within the metadata prompt
  deepDive: 80_000, // selected source files — Sonnet tier
  deepDivePerFile: 8_000, // any single file block within the deep-dive prompt
  profile: 12_000, // computed metrics + reused highlights — Sonnet tier
} as const;

// ---------------------------------------------------------------------------
// Metadata tier (Haiku) — DB-only context
// ---------------------------------------------------------------------------

export interface RepoMetadataContext {
  nameWithOwner: string;
  description?: string | null;
  topics: string[];
  languages: { language: string; bytes: number }[];
  readme?: string | null;
  recentCommitMessages: string[];
  stars: number;
  license?: string | null;
}

export function metadataSystemPrompt(): string {
  return (
    "You are a senior engineer summarizing an open-source repository for a " +
    "developer's portfolio dashboard. Be concise, concrete, and avoid marketing " +
    "language. Infer what the project does, the stack it uses, and the kind of " +
    "work it represents. If the available context is thin, say so plainly rather " +
    "than inventing detail.\n\n" +
    "Respond in GitHub-flavored Markdown: a 2-4 sentence overview, then a short " +
    "'Highlights' bulleted list (3-6 bullets) of the most notable, concrete facts."
  );
}

export function metadataUserPrompt(ctx: RepoMetadataContext): string {
  const langMix = topLanguageMix(ctx.languages);
  const readme = ctx.readme
    ? truncateToTokens(ctx.readme, TOKEN_CAPS.metadataReadme)
    : null;

  const body = [
    `Repository: ${ctx.nameWithOwner} (${ctx.stars}★)`,
    ctx.description ? `Description: ${ctx.description}` : "",
    langMix ? `Languages: ${langMix}` : "",
    ctx.topics.length ? `Topics: ${ctx.topics.join(", ")}` : "",
    ctx.license ? `License: ${ctx.license}` : "",
    ctx.recentCommitMessages.length
      ? `Recent commit messages:\n- ${ctx.recentCommitMessages
          .slice(0, 30)
          .join("\n- ")}`
      : "",
    readme ? `README:\n${readme}` : "(No README text is available.)",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Hard cap the whole assembled prompt as a backstop.
  return truncateToTokens(body, TOKEN_CAPS.metadata);
}

/** Render the byte-weighted top languages as a "TypeScript 62%, CSS 21%" string. */
function topLanguageMix(
  languages: { language: string; bytes: number }[],
  top = 6,
): string {
  const total = languages.reduce((a, l) => a + (l.bytes || 0), 0);
  if (total <= 0) return languages.map((l) => l.language).join(", ");
  return [...languages]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top)
    .map((l) => `${l.language} ${Math.round((l.bytes / total) * 100)}%`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Deep-dive tier (Sonnet) — selected source files
// ---------------------------------------------------------------------------

export interface DeepDiveFile {
  path: string;
  content: string;
}

export interface DeepDiveContext {
  nameWithOwner: string;
  description?: string | null;
  primaryLang?: string | null;
  headSha?: string | null;
  files: DeepDiveFile[];
}

export function deepDiveSystemPrompt(): string {
  return (
    "You are a staff engineer doing a fast architecture review of an unfamiliar " +
    "codebase. You are given a deterministically selected subset of high-signal " +
    "source files (entrypoints, config, routing, schema, and the largest modules) " +
    "— not the whole repo. Reason only from what you can see; do not invent " +
    "files, dependencies, or behavior you have no evidence for.\n\n" +
    "Produce GitHub-flavored Markdown covering, where the evidence supports it:\n" +
    "- Architecture & how the pieces fit together\n" +
    "- Notable patterns, abstractions, and design choices\n" +
    "- The stack and key dependencies\n" +
    "- Code quality / maintainability signals\n" +
    "Finish with a short 'Highlights' bulleted list (3-6 concrete bullets). Be " +
    "specific and cite file paths. Keep it tight."
  );
}

/**
 * Build the deep-dive content blocks: a small header block plus one block per
 * selected file. Each file block is individually capped, then files are added
 * until the cumulative deep-dive token cap is reached. The caller marks the
 * stable (header + file) blocks with cache_control.
 */
export function deepDiveContentBlocks(ctx: DeepDiveContext): string[] {
  const header = [
    `Repository: ${ctx.nameWithOwner}`,
    ctx.description ? `Description: ${ctx.description}` : "",
    ctx.primaryLang ? `Primary language: ${ctx.primaryLang}` : "",
    ctx.headSha ? `HEAD commit: ${ctx.headSha}` : "",
    `Selected ${ctx.files.length} high-signal file(s) for review (not the full tree).`,
  ]
    .filter(Boolean)
    .join("\n");

  const blocks: string[] = [header];

  let used = estimateTokens(header);
  for (const file of ctx.files) {
    const capped = truncateToTokens(file.content, TOKEN_CAPS.deepDivePerFile);
    const block = `\`\`\`\`\`\` file: ${file.path}\n${capped}\n\`\`\`\`\`\``;
    const cost = estimateTokens(block);
    if (used + cost > TOKEN_CAPS.deepDive) break;
    blocks.push(block);
    used += cost;
  }
  return blocks;
}

/** Conservative token estimate from character count. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Profile tier (Sonnet) — computed metrics + reused repo highlights
// ---------------------------------------------------------------------------

export interface ProfileRepoHighlight {
  nameWithOwner: string;
  // A short summary/highlights snippet reused from an existing METADATA summary.
  summary: string;
}

export interface ProfileContext {
  login?: string | null;
  metrics: {
    prsOpened: number;
    prsMerged: number;
    mergeRate: number | null;
    reviews: number;
    issuesOpened: number;
    commits: number;
    additions: number;
    deletions: number;
    cycleTimeP50: number | null;
    cycleTimeP90: number | null;
  };
  streak?: { current: number; longest: number } | null;
  distinctRepos: number;
  topRepoHighlights: ProfileRepoHighlight[];
}

export function profileSystemPrompt(): string {
  return (
    "You are writing a developer-profile summary for an open-source contribution " +
    "dashboard, based on computed metrics and short summaries of the repositories " +
    "the developer contributes to. Be concrete and grounded in the numbers; do " +
    "not flatter or exaggerate. Where a metric is null/zero, don't comment on it.\n\n" +
    "Produce GitHub-flavored Markdown: a 3-5 sentence narrative of this " +
    "developer's open-source profile (what they work on, how they contribute, " +
    "strengths), then a one-paragraph 'Portfolio blurb' suitable for a public " +
    "profile."
  );
}

export function profileUserPrompt(ctx: ProfileContext): string {
  const m = ctx.metrics;
  const pct = (v: number | null) =>
    v == null ? "n/a" : `${Math.round(v * 100)}%`;
  const dur = (sec: number | null) =>
    sec == null ? "n/a" : `${(sec / 3600).toFixed(1)}h`;

  const lines = [
    ctx.login ? `Developer: ${ctx.login}` : "Developer profile",
    "",
    "Computed contribution metrics (all-time, across contributed repos):",
    `- PRs opened: ${m.prsOpened}`,
    `- PRs merged: ${m.prsMerged} (merge rate ${pct(m.mergeRate)})`,
    `- Reviews given: ${m.reviews}`,
    `- Issues opened: ${m.issuesOpened}`,
    `- Commits: ${m.commits}`,
    `- Code churn: +${m.additions} / -${m.deletions}`,
    `- PR cycle time p50/p90: ${dur(m.cycleTimeP50)} / ${dur(m.cycleTimeP90)}`,
    `- Distinct repositories contributed to: ${ctx.distinctRepos}`,
    ctx.streak
      ? `- Active streak (days): current ${ctx.streak.current}, longest ${ctx.streak.longest}`
      : "",
    "",
    ctx.topRepoHighlights.length
      ? "Highlights from top contributed repositories:\n" +
        ctx.topRepoHighlights
          .map((r) => `### ${r.nameWithOwner}\n${r.summary}`)
          .join("\n\n")
      : "(No repository summaries available yet.)",
  ].filter((l) => l !== "");

  return truncateToTokens(lines.join("\n"), TOKEN_CAPS.profile);
}
