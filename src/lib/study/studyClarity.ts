/** Old generated paragraphs must be rebuilt, not clipped into wrong answers. */
export function needsConciseStudyRebuild(kind: string, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  const long = (value: unknown, limit: number) => typeof value === "string"
    && value.trim().split(/\s+/).length > limit;
  if (kind === "flashcards" && Array.isArray(data.cards)) {
    return data.cards.some((card) => long(card.back, 40));
  }
  if (kind === "multiple_choice" && Array.isArray(data.questions)) {
    return data.questions.some((question) => Array.isArray(question.choices)
      && question.choices.some((choice: unknown) => long(choice, 14)));
  }
  if (kind === "matching" && Array.isArray(data.pairs)) {
    return data.pairs.some((pair) => long(pair.left, 6) || long(pair.right, 12));
  }
  return false;
}
