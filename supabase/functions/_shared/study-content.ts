/** Separate from the scoring version: presentation updates never reset memory. */
export const STUDY_CONTENT_VERSION = "concise-study-v1";

export function isConciseStudyKind(kind: string): boolean {
  return ["flashcards", "multiple_choice", "matching"].includes(kind);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** A short slide dump is still a slide dump. Never grade clipped prose or logistics. */
export function isStudyAnswerDump(value: string): boolean {
  return /[•▪]|\s·\s.*(?:\s·\s|:)/.test(value)
    || /(?:…|\.{3})\s*$/.test(value)
    || /\b(?:assignment\s+(?:due|\()|due\s*:|(?:quiz|exam)\s+\d|key concepts for|write\s+\d+\s+pages?|upload to canvas|sometime next week|bring (?:your|a) (?:textbook|pencil))/i.test(value)
    || (value.match(/(?:^|[;\n]|\s)\p{Lu}[\p{L} -]{1,35}:\s/gu)?.length ?? 0) > 1;
}

/** Shared by stored-set eligibility and the server before insertion. */
export function needsConciseStudyRebuild(kind: string, payload: unknown): boolean {
  if (!isConciseStudyKind(kind)) return false;
  if (!record(payload)) return true;
  const bad = (value: unknown, limit: number) => typeof value !== "string"
    || !value.trim() || value.trim().split(/\s+/).length > limit || isStudyAnswerDump(value);
  if (kind === "flashcards") {
    return !Array.isArray(payload.cards) || payload.cards.length === 0
      || payload.cards.some((card) => !record(card) || bad(card.back, 40));
  }
  if (kind === "multiple_choice") {
    return !Array.isArray(payload.questions) || payload.questions.length === 0
      || payload.questions.some((question) => !record(question)
        || !Array.isArray(question.choices) || question.choices.length !== 4
        || question.choices.some((choice) => bad(choice, 14)));
  }
  return !Array.isArray(payload.pairs) || payload.pairs.length < 3
    || payload.pairs.some((pair) => !record(pair) || bad(pair.left, 6) || bad(pair.right, 12));
}
