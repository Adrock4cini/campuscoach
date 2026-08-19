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
 * Publisher furniture that OCR reliably drags in: copyright lines, running
 * heads, page numbers, slide numbers, chapter labels. None of it is knowledge,
 * so none of it may become a flashcard answer or a mnemonic target.
 */
const FURNITURE_LINE =
  /(©|\(c\)\s*\d{4}|all rights reserved|\bpage\s+\d+\b|\bp{1,2}\.\s*\d+\b|\bslide\s+\d+\b|\bchapter\s+\d+\b|\bunit\s+\d+\b|\bsection\s+\d+(\.\d+)*\b|\bfigure\s+\d+\b|\btable\s+\d+\b)/i;

/** Words that signal an actual explanation rather than a label. */
const EXPLANATORY_SIGNAL =
  /\b(is|are|was|were|means|refers|defined|definition|because|when|which|that|who|requires|allows|includes|equals|causes|results|must|can|may|do|does|has|have|will|said|says|need|needs|becomes|occurs|happens|makes|gives|shows)\b/i;

/**
 * Removes trailing source furniture ("… © Stringham Schools 159") so the real
 * sentence can be judged on its own merits.
 */
export function stripSourceFurniture(rawText: string): string {
  return rawText
    .replace(/©[^\n]*/g, " ")
    .replace(/\(c\)\s*\d{4}[^\n]*/gi, " ")
    .replace(/all rights reserved[^\n]*/gi, " ")
    .replace(/\b(?:page|pg\.?|slide)\s+\d+\b/gi, " ")
    .replace(/\s+\d{1,4}\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the text reads like a heading, label, running head, or page
 * fragment rather than something a student could learn from.
 *
 * This is the difference between "Exclusive right-to-sell with exclusions
 * © Stringham Schools 159" (a heading plus furniture) and "An exclusive
 * right-to-sell listing pays the broker regardless of who finds the buyer."
 */
export function isNonExplanatoryFragment(rawText: string): boolean {
  const original = rawText.trim();
  if (!original) return true;
  // Equations and other exact thin sources are legitimate answers.
  if (extractExactThinSource(original)) return false;

  const stripped = stripSourceFurniture(original);
  if (!stripped) return true;

  const hadFurniture = FURNITURE_LINE.test(original);
  const words = stripped.split(/\s+/).filter(Boolean);
  const hasExplanation = EXPLANATORY_SIGNAL.test(stripped);
  const hasSentenceEnd = /[.!?:]/.test(stripped);

  // A heading is short, has no verb, and does not finish a thought.
  if (!hasExplanation && (words.length < 12 || !hasSentenceEnd)) return true;
  // Furniture with nothing but a title left behind is still a heading.
  if (hadFurniture && !hasExplanation) return true;
  // ALL-CAPS running heads.
  if (words.length <= 12 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped)) return true;
  return false;
}

/**
 * Keep the learning pipeline conservative: a capture must contain a concrete
 * fact, definition, example, equation, or professor signal before it can
 * become permanent Concept memory. Short requests such as "Help me" are UI
 * intent, not academic evidence, and headings/copyright lines are not
 * knowledge either.
 */
export function assessSourceSufficiency(rawText: string): SourceSufficiency {
  const source = rawText.trim();
  if (!source) return { sufficient: false, reason: "empty" };
  if (extractExactThinSource(source)) return { sufficient: true };
  if (VAGUE_SOURCE.test(source)) return { sufficient: false, reason: "vague" };

  const meaningful = stripSourceFurniture(source)
    .toLowerCase()
    .replace(/[^a-z0-9'’-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  if (meaningful.length < 3) return { sufficient: false, reason: "too_thin" };
  if (isNonExplanatoryFragment(source)) return { sufficient: false, reason: "heading_only" };
  return { sufficient: true };
}

