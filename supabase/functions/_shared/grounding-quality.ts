import { extractExactThinSource } from "./thin-source.ts";

export interface SourceSufficiency {
  sufficient: boolean;
  reason?: string;
}
const VAGUE_SOURCE = /^(?:please\s+)?(?:help(?:\s+me)?|study\s+this|remember\s+this|explain\s+this|what\s+is\s+this|i\s+(?:do\s+not|don't)\s+understand|i(?:'m|\s+am)\s+confused)[.!?]*$/i;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "in", "is", "it", "of", "on", "or", "said", "says", "that", "the",
  "this", "to", "was", "were", "will", "with", "your",
]);

/**
 * Keep the learning pipeline conservative: a capture must contain a concrete
 * fact, definition, example, equation, or professor signal before it can
 * become permanent Concept memory. Short requests such as "Help me" are UI
 * intent, not academic evidence.
 */
export function assessSourceSufficiency(rawText: string): SourceSufficiency {
  const source = rawText.trim();
  if (!source) return { sufficient: false, reason: "empty" };
  if (extractExactThinSource(source)) return { sufficient: true };
  if (VAGUE_SOURCE.test(source)) return { sufficient: false, reason: "vague" };

  const meaningful = source
    .toLowerCase()
    .replace(/[^a-z0-9'’-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  if (meaningful.length < 3) return { sufficient: false, reason: "too_thin" };
  return { sufficient: true };
}
