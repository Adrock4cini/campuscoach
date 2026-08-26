/**
 * Teachable-content gate.
 *
 * Source evidence is NOT automatically teaching content. A capture can hold
 * plenty of true text that must never become a flashcard answer, a matching
 * definition, or a multiple-choice option:
 *
 *   - logistics/scheduling/admin lines  ("Test Friday — covers fractions…")
 *   - the student's own confusion       ("I never know whether to multiply…")
 *   - capture/QA metadata               ("P9 mobile note", "QA probe 3")
 *   - headings and publisher furniture  (handled by grounding-quality)
 *
 * A misconception is still valuable — extract-concepts may keep it as a
 * weakness signal — but it can never be served back as a correct answer.
 */

import { isLogisticsLine, isNonExplanatoryFragment, stripSourceFurniture } from "./grounding-quality.ts";

/**
 * First-person confusion / misconception statements. These describe the
 * student's state, not the subject matter.
 */
const CONFUSION_LINE =
  /(^|[.\n:;]\s*)(?:student\s+note\s*:\s*)?i\s+(?:never|always|don'?t|do\s+not|can'?t|cannot|am\s+not\s+sure|'?m\s+not\s+sure|struggle|get\s+confused|keep\s+(?:forgetting|mixing))\b/i;

const CONFUSION_PHRASE =
  /\b(?:i\s+(?:never|don'?t|do\s+not|can'?t|cannot)\s+(?:know|get|understand|remember)|confuses?\s+me|makes?\s+no\s+sense\s+to\s+me|i'?m\s+confused)\b/i;

/**
 * Capture/QA/device metadata that OCR and manual test notes drag in:
 * "P9 mobile note", "QA probe 3", "test capture 2", "smoke test note".
 */
const METADATA_LINE = new RegExp(
  "^(?:" +
  "p\\d{1,3}\\b[^.\\n]{0,40}" +                                  // P9 mobile note
  "|(?:qa|q\\.a\\.)\\b[^.\\n]{0,40}" +                           // QA probe 3
  "|(?:smoke|regression|probe|debug|sanity)\\b[^.\\n]{0,40}" +
  "|test\\s+(?:capture|note|probe|run|account|data)\\b[^.\\n]{0,40}" +
  "|(?:capture|note|upload|scan)\\s*#?\\d{1,4}" +
  "|(?:mobile|desktop|ios|android|web)\\s+(?:note|capture|test|probe)\\b[^.\\n]{0,30}" +
  ")[.!\\s]*$",
  "i",
);

/**
 * Logistics often carries a trailing clause ("Test Friday — covers fractions,
 * decimals, and percentages."). The leading clause still decides what the line
 * is, so it is judged on its own.
 */
function leadingClause(text: string): string {
  return text.split(/\s*[\u2014\u2013:;,-]\s+|\s*[\u2014\u2013]\s*/)[0]?.trim() ?? text;
}

/** True when the line is a schedule/admin note, including trailing detail. */
export function isLogisticsHeadline(rawText: string): boolean {
  const text = (rawText ?? "").trim();
  if (!text) return false;
  if (isLogisticsLine(text)) return true;
  const lead = leadingClause(text);
  return lead !== text && lead.length > 0 && isLogisticsLine(lead);
}

/** True when the line describes the student's confusion rather than content. */
export function isStudentConfusionLine(rawText: string): boolean {
  const text = (rawText ?? "").trim();
  if (!text) return false;
  return CONFUSION_LINE.test(text) || CONFUSION_PHRASE.test(text);
}

/** True when the line is capture/QA/device metadata rather than class content. */
export function isCaptureMetadataLine(rawText: string): boolean {
  const text = stripSourceFurniture((rawText ?? "").trim());
  if (!text) return false;
  return METADATA_LINE.test(text);
}

/**
 * The single gate every generator must pass text through before that text is
 * allowed to act as a taught answer, definition, or distractor.
 */
export function isTeachableAnswer(rawText: string | null | undefined): boolean {
  const text = (rawText ?? "").trim();
  if (!text) return false;
  if (isLogisticsHeadline(text)) return false;
  if (isStudentConfusionLine(text)) return false;
  if (isCaptureMetadataLine(text)) return false;
  return !isNonExplanatoryFragment(text);
}

/**
 * A concept whose own name is logistics, confusion, or metadata must never
 * anchor a study item even when some other sentence in the capture is fine.
 */
export function isTeachableConceptName(rawText: string | null | undefined): boolean {
  const text = (rawText ?? "").trim();
  if (!text) return false;
  return !isLogisticsHeadline(text) && !isStudentConfusionLine(text) && !isCaptureMetadataLine(text);
}
