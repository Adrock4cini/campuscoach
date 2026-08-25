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

const WEEKDAY =
  "(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs?|rsday|thursday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const ASSESSMENT_NOUN =
  "(?:test|quiz|exam|midterm|final|homework|hw|assignment|project|paper|essay|lab|reading)";

/**
 * Logistics and schedule lines: "Test Friday", "Homework is due Monday",
 * "Quiz next week", "No class tomorrow", "Class is cancelled". These carry a
 * verb, so they slip past the explanatory-signal check — but they are
 * planning information, never knowledge, and must not become a concept
 * definition, an answer key, or a match pair.
 *
 * Anchored to the whole line and always requires an assessment/logistics
 * noun plus a time or due word, so real content ("The final exam tests your
 * understanding of integrals") is untouched.
 */
const LOGISTICS_LINE = new RegExp(
  `^(?:remember[:,]?\\s*)?(?:` +
  `${ASSESSMENT_NOUN}\\b[^.!?\\n]{0,40}?\\b(?:due\\s+)?(?:on\\s+)?(?:this\\s+|next\\s+)?${WEEKDAY}\\b` +
  `|${ASSESSMENT_NOUN}\\b[^.!?\\n]{0,40}?\\b(?:due|tomorrow|today|tonight|next\\s+week|this\\s+week)\\b` +
  `|due\\s+(?:on\\s+)?(?:this\\s+|next\\s+)?${WEEKDAY}\\b` +
  `|no\\s+class\\b` +
  `|class\\s+(?:is\\s+)?(?:cancelled|canceled)\\b` +
  `)[.!\\s]*$`,
  "i",
);

/**
 * True when the whole line is a schedule/logistics note rather than
 * learnable content. Exact equations stay learnable.
 */
export function isLogisticsLine(rawText: string): boolean {
  const text = rawText.trim();
  if (!text) return false;
  if (extractExactThinSource(text)) return false;
  return LOGISTICS_LINE.test(text);
}

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
 * True when the text carries publisher furniture (copyright line, running head,
 * page/slide number). Such text is never knowledge, so it may not appear as an
 * answer choice, match pair, or mnemonic target even when it is short.
 */
export function containsSourceFurniture(rawText: string): boolean {
  return FURNITURE_LINE.test(rawText);
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
  // Schedule lines ("Test is Friday") are planning info, never an answer.
  if (isLogisticsLine(original)) return true;

  const stripped = stripSourceFurniture(original);
  if (!stripped) return true;

  const hadFurniture = FURNITURE_LINE.test(original);
  const words = stripped.split(/\s+/).filter(Boolean);
  const hasExplanation = EXPLANATORY_SIGNAL.test(stripped);
  const hasSentenceEnd = /[.!?:]/.test(stripped);
  // Short formulas ("F = ma", "a² + b² = c²") teach as well as sentences.
  const looksLikeEquation = /[=<>]/.test(stripped) && words.length <= 12;

  // ALL-CAPS running heads.
  if (words.length <= 12 && stripped === stripped.toUpperCase() && /[A-Z]/.test(stripped) && !looksLikeEquation) {
    return true;
  }
  if (looksLikeEquation) return false;
  // Furniture with nothing but a title left behind is still a heading.
  if (hadFurniture && !hasExplanation) return true;
  if (hasExplanation) return false;
  // No recognised verb: only a finished sentence of real length still teaches.
  return !(hasSentenceEnd && words.length >= 5 && !hadFurniture);

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

