export interface GroundedMatchingPair {
  id: string;
  conceptId: string;
  conceptName: string;
  left: string;
  right: string;
  sourceExcerpt?: string;
}

export interface MatchingPayload {
  pairs: GroundedMatchingPair[];
}

export interface MatchingRightChoice {
  pairId: string;
  label: string;
}

export type MatchingShuffle = (
  choices: readonly MatchingRightChoice[],
) => MatchingRightChoice[];

export interface MatchingConceptResult {
  conceptId: string;
  firstAttemptCorrect: boolean;
  recovered: boolean;
}

export interface MatchingFirstChoice {
  /** Immutable pair on the left that the student was answering. */
  leftPairId: string;
  /** Immutable pair owning the right-side answer selected first. */
  rightPairId: string;
}

export interface MatchingCompletionResult {
  correctFirstAttempt: number;
  total: number;
  perConcept: MatchingConceptResult[];
  /** Server-gradeable first choices; the forced final pair is intentionally absent. */
  firstChoices: MatchingFirstChoice[];
}

const MIN_PAIRS = 3;
const MAX_PAIRS = 6;

function normalizedKey(value: string): string {
  return value.trim().toLowerCase();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates untrusted artifact JSON before the game renders. An allow-list is
 * required so a stale or malformed artifact cannot report results for a
 * concept outside the study set that produced it.
 */
export function validateMatchingPayload(
  payload: unknown,
  allowedConceptIds: readonly string[],
): MatchingPayload | null {
  if (
    !payload
    || typeof payload !== "object"
    || !Array.isArray((payload as { pairs?: unknown }).pairs)
  ) {
    return null;
  }

  const rawPairs = (payload as { pairs: unknown[] }).pairs;
  if (rawPairs.length < MIN_PAIRS || rawPairs.length > MAX_PAIRS) return null;

  const allowed = new Set(
    allowedConceptIds
      .filter(isNonEmptyString)
      .map((id) => id.trim()),
  );
  if (allowed.size === 0) return null;

  const pairIds = new Set<string>();
  const leftValues = new Set<string>();
  const rightValues = new Set<string>();
  const pairs: GroundedMatchingPair[] = [];

  for (const rawPair of rawPairs) {
    if (!rawPair || typeof rawPair !== "object" || Array.isArray(rawPair)) {
      return null;
    }

    const candidate = rawPair as Record<string, unknown>;
    if (
      !isNonEmptyString(candidate.id)
      || !isNonEmptyString(candidate.conceptId)
      || !isNonEmptyString(candidate.conceptName)
      || !isNonEmptyString(candidate.left)
      || !isNonEmptyString(candidate.right)
      || (
        candidate.sourceExcerpt !== undefined
        && !isNonEmptyString(candidate.sourceExcerpt)
      )
    ) {
      return null;
    }

    const id = candidate.id.trim();
    const conceptId = candidate.conceptId.trim();
    const left = candidate.left.trim();
    const right = candidate.right.trim();
    const leftKey = normalizedKey(left);
    const rightKey = normalizedKey(right);

    if (
      !allowed.has(conceptId)
      || pairIds.has(id)
      || leftValues.has(leftKey)
      || rightValues.has(rightKey)
    ) {
      return null;
    }

    pairIds.add(id);
    leftValues.add(leftKey);
    rightValues.add(rightKey);
    pairs.push({
      id,
      conceptId,
      conceptName: candidate.conceptName.trim(),
      left,
      right,
      ...(isNonEmptyString(candidate.sourceExcerpt)
        ? { sourceExcerpt: candidate.sourceExcerpt.trim() }
        : {}),
    });
  }

  return { pairs };
}

/** Fisher-Yates shuffle. Tests can inject a fixed shuffle through the component. */
export const randomMatchingShuffle: MatchingShuffle = (choices) => {
  const shuffled = [...choices];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

export function isMatchingChoicePermutation(
  choices: readonly MatchingRightChoice[],
  expectedChoices: readonly MatchingRightChoice[],
): boolean {
  if (choices.length !== expectedChoices.length) return false;
  const expected = new Map(
    expectedChoices.map((choice) => [choice.pairId, choice.label]),
  );
  const seen = new Set<string>();

  return choices.every((choice) => {
    if (
      !choice
      || typeof choice.pairId !== "string"
      || typeof choice.label !== "string"
      || expected.get(choice.pairId) !== choice.label
      || seen.has(choice.pairId)
    ) {
      return false;
    }
    seen.add(choice.pairId);
    return true;
  });
}
