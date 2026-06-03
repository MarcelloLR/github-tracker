// Bump PROMPT_VERSION to invalidate every cached AISummary at once.
export const PROMPT_VERSION = 1;

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
    "developer's portfolio dashboard. Be concise, concrete, and avoid marketing language."
  );
}

export function metadataUserPrompt(ctx: RepoMetadataContext): string {
  // TODO: assemble + hard-truncate to the metadata token cap; put the README
  // behind a cache_control block when constructing the actual message.
  return [
    `Repository: ${ctx.nameWithOwner} (${ctx.stars}★)`,
    ctx.description ? `Description: ${ctx.description}` : "",
    `Languages: ${ctx.languages.map((l) => l.language).join(", ")}`,
    ctx.topics.length ? `Topics: ${ctx.topics.join(", ")}` : "",
    ctx.recentCommitMessages.length
      ? `Recent commits:\n- ${ctx.recentCommitMessages.slice(0, 30).join("\n- ")}`
      : "",
    ctx.readme ? `README:\n${ctx.readme}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
