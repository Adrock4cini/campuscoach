export type ConfidenceLevel = "low" | "medium" | "high";

export interface ItemResult {
  itemIndex: number;
  confidence: ConfidenceLevel;
  selectedChoiceIndex?: number;
  selfReportedCorrect?: boolean;
}

export interface SavedItemResult {
  item_index: number;
  answer_confidence: string;
  selected_choice_index: number | null;
  self_reported_correct: boolean | null;
}

export function validItemResult(item: unknown): item is ItemResult {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const value = item as Record<string, unknown>;
  return Number.isInteger(value.itemIndex)
    && (value.itemIndex as number) >= 0
    && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high")
    && !("conceptId" in value)
    && !("correct" in value);
}

export function artifactItems(kind: string, payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const key = kind === "flashcards"
    ? "cards"
    : kind === "multiple_choice" ? "questions" : null;
  if (!key) return null;
  const items = (payload as Record<string, unknown>)[key];
  return Array.isArray(items) ? items : null;
}

export function validArtifactItemResults(
  kind: string,
  storedItems: unknown[],
  conceptIds: string[],
  requested: ItemResult[],
) {
  if (storedItems.length !== requested.length) return false;
  const ordered = [...requested].sort((a, b) => a.itemIndex - b.itemIndex);

  return ordered.every((result, index) => {
    const stored = storedItems[index];
    if (result.itemIndex !== index || !stored || typeof stored !== "object"
        || Array.isArray(stored)) return false;

    const item = stored as Record<string, unknown>;
    if (typeof item.conceptId !== "string"
        || !conceptIds.includes(item.conceptId)) return false;

    if (kind === "multiple_choice") {
      const choices = item.choices;
      return Array.isArray(choices)
        && choices.length > 0
        && choices.every((choice) => typeof choice === "string" && choice.trim().length > 0)
        && Number.isInteger(item.answerIndex)
        && (item.answerIndex as number) >= 0
        && (item.answerIndex as number) < choices.length
        && Number.isInteger(result.selectedChoiceIndex)
        && (result.selectedChoiceIndex as number) >= 0
        && (result.selectedChoiceIndex as number) < choices.length
        && result.selfReportedCorrect === undefined;
    }

    return kind === "flashcards"
      && typeof result.selfReportedCorrect === "boolean"
      && result.selectedChoiceIndex === undefined;
  });
}

export function sameSavedItemResults(
  requested: ItemResult[],
  saved: SavedItemResult[],
) {
  if (requested.length !== saved.length) return false;
  const ordered = [...requested].sort((a, b) => a.itemIndex - b.itemIndex);
  return ordered.every((item, index) => {
    const prior = saved[index];
    return prior?.item_index === item.itemIndex
      && prior.answer_confidence === item.confidence
      && prior.selected_choice_index === (item.selectedChoiceIndex ?? null)
      && prior.self_reported_correct === (item.selfReportedCorrect ?? null);
  });
}
