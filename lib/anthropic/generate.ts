import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic/client";
import { estimateTokens } from "@/lib/anthropic/prompts";

// Per-1M-token USD pricing, keyed by model id. Used to record costUsd on each
// AISummary. Falls back to 0 for an unknown model so a pricing gap never
// crashes a job (the summary still gets written; cost just reads as 0).
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
};

export interface GenerateResult {
  summaryMd: string;
  highlights: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface GenerateOptions {
  model: string;
  system: string;
  /**
   * Stable prompt blocks (large, reused across requests). Each is sent as a
   * separate text content block; cache_control: ephemeral is placed on the LAST
   * stable block so the whole prefix up to that point is cached. Provide the
   * largest/most-reused content here (README, source files, metric context).
   */
  stableBlocks: string[];
  /**
   * Volatile trailing instruction appended after the cache breakpoint. Optional.
   */
  trailing?: string;
  /** Hard input-token cap for this tier; assembled blocks must fit under it. */
  inputTokenCap: number;
  maxTokens?: number;
}

/**
 * Single-shot Claude call for a summary tier. Enforces the input-token cap by
 * estimate before issuing the request, marks the stable prefix with
 * cache_control, and returns the markdown plus token/cost accounting.
 *
 * Worker-only: never import this from app/.
 */
export async function generateSummary(
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const client = getAnthropic();

  const blocks = capBlocks(opts.stableBlocks, opts.inputTokenCap);

  // Build content blocks: stable blocks first (cache_control on the last one),
  // then any volatile trailing instruction after the breakpoint.
  const content: Anthropic.TextBlockParam[] = blocks.map((text, i) => {
    const block: Anthropic.TextBlockParam = { type: "text", text };
    if (i === blocks.length - 1) {
      block.cache_control = { type: "ephemeral" };
    }
    return block;
  });
  if (opts.trailing) {
    content.push({ type: "text", text: opts.trailing });
  }

  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: [
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content }],
  });

  const summaryMd = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const usage = message.usage;
  // Total prompt tokens billed at input rate = uncached + cache write + cache read.
  const inputTokens =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const outputTokens = usage.output_tokens;

  return {
    summaryMd,
    highlights: extractHighlights(summaryMd),
    inputTokens,
    outputTokens,
    costUsd: computeCost(
      opts.model,
      usage.input_tokens,
      usage.cache_creation_input_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0,
      outputTokens,
    ),
  };
}

/** Drop stable blocks once the cumulative estimate would exceed the cap. */
function capBlocks(blocks: string[], cap: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const b of blocks) {
    const cost = estimateTokens(b);
    if (used + cost > cap && kept.length > 0) break;
    kept.push(b);
    used += cost;
  }
  return kept;
}

/**
 * Approximate billed cost. Cache writes cost ~1.25x input, cache reads ~0.1x.
 * Uncached input and output are at base rate.
 */
function computeCost(
  model: string,
  uncachedInput: number,
  cacheWrite: number,
  cacheRead: number,
  output: number,
): number {
  const price = PRICING[model] ?? { input: 0, output: 0 };
  const inputCost =
    (uncachedInput * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1) /
    1_000_000;
  const outputCost = (output * price.output) / 1_000_000;
  // Round to 5 decimals to match the AISummary.costUsd Decimal(10,5) column.
  return Math.round((inputCost + outputCost) * 1e5) / 1e5;
}

/**
 * Pull a structured highlights array out of the markdown. We instruct the model
 * to end with a "Highlights" bulleted list; collect the bullets under it. Falls
 * back to the first few top-level bullets anywhere in the doc.
 */
export function extractHighlights(md: string): string[] {
  const lines = md.split("\n");
  const headingIdx = lines.findIndex((l) =>
    /^#{0,6}\s*.*highlights/i.test(l.trim()),
  );

  const collectBullets = (from: number, to: number): string[] => {
    const out: string[] = [];
    for (let i = from; i < to; i++) {
      const m = lines[i].match(/^\s*[-*]\s+(.*\S)\s*$/);
      if (m) out.push(m[1].trim());
      else if (out.length && /^#{1,6}\s/.test(lines[i])) break; // next heading ends the list
    }
    return out;
  };

  if (headingIdx >= 0) {
    const bullets = collectBullets(headingIdx + 1, lines.length);
    if (bullets.length) return bullets.slice(0, 8);
  }
  return collectBullets(0, lines.length).slice(0, 6);
}
