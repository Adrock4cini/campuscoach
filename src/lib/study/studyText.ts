/**
 * Presentation-only cleanup for grounded study text.
 *
 * Study items are generated from real class material, so the wording is the
 * student's own source. These helpers never change meaning: they strip page
 * furniture (running heads, "PART 1", page numbers, bullet glyphs) that the
 * OCR/paste pipeline carried into a prompt or answer, and they flag text that
 * is too long to scan on a phone so the UI can scroll it instead of cutting
 * it. Nothing here truncates an answer — a shortened answer could read as
 * wrong, which is never an acceptable trade for tidiness.
 */

/** Above this length an answer is scrollable rather than a wall of text. */
export const LONG_STUDY_TEXT = 220;

const LEADING_FURNITURE =
  /^(?:part|page|pg\.?|chapter|ch\.?|unit|section|sec\.?|module|lesson)\s+(?:[0-9]{1,3}|[ivxlcdm]{1,6})\b[\s:.\-–—]*/i;
const LEADING_BULLET = /^[\s>•·▪◦*\-–—]+/;
const LEADING_LIST_NUMBER = /^\(?\d{1,2}[).]\s+/;
const TRAILING_PAGE = /[\s|·]*(?:page|pg\.?)\s*\d{1,3}\s*$/i;

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Removes obvious source furniture from the front of a study string.
 * Falls back to the original text whenever cleaning would leave too little
 * behind to still be a truthful, readable item.
 */
export function cleanStudyText(value: string): string {
  const original = collapse(value);
  if (!original) return "";

  let text = original;
  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    text = text.replace(LEADING_BULLET, "");
    text = text.replace(LEADING_LIST_NUMBER, "");
    text = text.replace(LEADING_FURNITURE, "");
    text = collapse(text);
    if (text === before) break;
  }
  text = collapse(text.replace(TRAILING_PAGE, ""));

  // Never hand back an empty or near-empty item just because the source was
  // mostly furniture — the untouched original is still the honest answer.
  if (text.length < 3) return original;
  return text;
}

export function isLongStudyText(value: string, limit = LONG_STUDY_TEXT): boolean {
  return cleanStudyText(value).length > limit;
}

const OWN_WORDS_PROMPT = /^explain\s*(.*?)\s*in your own words\.?$/i;

/**
 * Rewrites the legacy "Explain X in your own words." card front into a
 * retrieval prompt that matches the controls actually on screen: there is no
 * text box, so the student recalls silently and then reveals.
 *
 * Existing artifacts already carry the old wording, so this runs at display
 * time rather than requiring every student to rebuild their sets.
 */
export function retrievalPrompt(front: string, conceptName?: string): string {
  const clean = cleanStudyText(front);
  const match = OWN_WORDS_PROMPT.exec(clean);
  const subject = cleanStudyText(match?.[1] ?? "") || cleanStudyText(conceptName ?? "");
  if (match && subject) return `What do you remember about ${subject}?`;
  return clean;
}
