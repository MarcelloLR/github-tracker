import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | undefined;

/** Lazily constructed so importing this module never throws when the key is unset. */
export function getAnthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Cheap model for metadata; stronger model for deep-dive + profile. See docs/SPEC.md.
export const MODELS = {
  metadata: process.env.ANTHROPIC_MODEL_METADATA ?? "claude-haiku-4-5",
  deepDive: process.env.ANTHROPIC_MODEL_DEEPDIVE ?? "claude-sonnet-4-6",
  profile: process.env.ANTHROPIC_MODEL_PROFILE ?? "claude-sonnet-4-6",
} as const;
