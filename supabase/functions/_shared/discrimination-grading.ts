/**
 * Server-side grading for recognition/discrimination study formats.
 *
 * The browser reports the student's immutable first selection. Correctness is
 * always derived from the stored artifact payload; a browser-computed boolean
 * is never accepted as the source of truth for positive discrimination
 * evidence.
 */

export interface MultipleChoiceSelection {
  conceptId: string;
  firstSelectedIndex: number;
}

export interface MatchingFirstChoice {
  leftPairId: string;
  rightPairId: string;
}

export interface MultipleChoiceGrade {
  conceptId: string;
  correct: boolean;
  firstSelectedIndex: number;
}

export interface MatchingGrade {
  conceptId: string;
  correct: boolean;
  leftPairId: string;
  rightPairId: string;
}

type GradingResult<T> =
  | { ok: true; grades: T[] }
  | { ok: false; reason: string };

interface CanonicalQuestion {
  conceptId: string;
  answerIndex: number;
  choiceCount: number;
}

interface CanonicalPair {
  id: string;
  conceptId: string;
}

export function gradeMultipleChoiceSelections(
  payload: unknown,
  selections: readonly MultipleChoiceSelection[],
): GradingResult<MultipleChoiceGrade> {
  const questions = canonicalMultipleChoiceQuestions(payload);
  if (!questions) return { ok: false, reason: "multiple-choice artifact payload is invalid" };
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > questions.length) {
    return { ok: false, reason: "multiple-choice selections are incomplete" };
  }

  const questionByConcept = new Map(questions.map((question) => [question.conceptId, question]));
  const seen = new Set<string>();
  const grades: MultipleChoiceGrade[] = [];
  for (const selection of selections) {
    if (!selection || typeof selection !== "object"
        || typeof selection.conceptId !== "string"
        || !Number.isInteger(selection.firstSelectedIndex)
        || seen.has(selection.conceptId)) {
      return { ok: false, reason: "multiple-choice selection is invalid or duplicated" };
    }
    const question = questionByConcept.get(selection.conceptId);
    if (!question
        || selection.firstSelectedIndex < 0
        || selection.firstSelectedIndex >= question.choiceCount) {
      return { ok: false, reason: "multiple-choice selection does not match the artifact" };
    }
    seen.add(selection.conceptId);
    grades.push({
      conceptId: selection.conceptId,
      correct: selection.firstSelectedIndex === question.answerIndex,
      firstSelectedIndex: selection.firstSelectedIndex,
    });
  }
  return { ok: true, grades };
}

export function gradeMatchingFirstChoices(
  payload: unknown,
  firstChoices: readonly MatchingFirstChoice[],
): GradingResult<MatchingGrade> {
  const pairs = canonicalMatchingPairs(payload);
  if (!pairs) return { ok: false, reason: "matching artifact payload is invalid" };

  // A clean completion has one independent choice per pair except the final
  // forced one. A pair attempted earlier and recovered can make all N pairs
  // independently scorable, so N-1 and N are both valid.
  if (!Array.isArray(firstChoices)
      || firstChoices.length < pairs.length - 1
      || firstChoices.length > pairs.length) {
    return { ok: false, reason: "matching first choices are incomplete" };
  }

  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const seenLeftIds = new Set<string>();
  const grades: MatchingGrade[] = [];
  for (const choice of firstChoices) {
    if (!choice || typeof choice !== "object"
        || typeof choice.leftPairId !== "string"
        || typeof choice.rightPairId !== "string"
        || seenLeftIds.has(choice.leftPairId)) {
      return { ok: false, reason: "matching first choice is invalid or duplicated" };
    }
    const leftPair = pairById.get(choice.leftPairId);
    if (!leftPair || !pairById.has(choice.rightPairId)) {
      return { ok: false, reason: "matching first choice does not match the artifact" };
    }
    seenLeftIds.add(choice.leftPairId);
    grades.push({
      conceptId: leftPair.conceptId,
      correct: choice.leftPairId === choice.rightPairId,
      leftPairId: choice.leftPairId,
      rightPairId: choice.rightPairId,
    });
  }
  // With N untouched pairs, completing the board inevitably leaves one final
  // one-choice match. N independently scored entries are possible only when
  // that eventual final pair had already recorded an earlier miss.
  if (firstChoices.length === pairs.length && grades.every((grade) => grade.correct)) {
    return { ok: false, reason: "matching transcript includes a forced final answer" };
  }
  return { ok: true, grades };
}

function canonicalMultipleChoiceQuestions(payload: unknown): CanonicalQuestion[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.questions)) return null;
  const questions: CanonicalQuestion[] = [];
  const conceptIds = new Set<string>();
  for (const rawQuestion of payload.questions) {
    if (!isRecord(rawQuestion)
        || typeof rawQuestion.conceptId !== "string"
        || !rawQuestion.conceptId
        || conceptIds.has(rawQuestion.conceptId)
        || !Array.isArray(rawQuestion.choices)
        || rawQuestion.choices.length !== 4
        || rawQuestion.choices.some((choice) => typeof choice !== "string" || !choice.trim())
        || !Number.isInteger(rawQuestion.answerIndex)
        || (rawQuestion.answerIndex as number) < 0
        || (rawQuestion.answerIndex as number) >= rawQuestion.choices.length) {
      return null;
    }
    conceptIds.add(rawQuestion.conceptId);
    questions.push({
      conceptId: rawQuestion.conceptId,
      answerIndex: rawQuestion.answerIndex as number,
      choiceCount: rawQuestion.choices.length,
    });
  }
  return questions.length > 0 ? questions : null;
}

function canonicalMatchingPairs(payload: unknown): CanonicalPair[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.pairs)
      || payload.pairs.length < 3 || payload.pairs.length > 6) return null;
  const pairs: CanonicalPair[] = [];
  const pairIds = new Set<string>();
  const conceptIds = new Set<string>();
  for (const rawPair of payload.pairs) {
    if (!isRecord(rawPair)
        || typeof rawPair.id !== "string"
        || !rawPair.id
        || pairIds.has(rawPair.id)
        || typeof rawPair.conceptId !== "string"
        || !rawPair.conceptId
        || conceptIds.has(rawPair.conceptId)) {
      return null;
    }
    pairIds.add(rawPair.id);
    conceptIds.add(rawPair.conceptId);
    pairs.push({ id: rawPair.id, conceptId: rawPair.conceptId });
  }
  return pairs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
