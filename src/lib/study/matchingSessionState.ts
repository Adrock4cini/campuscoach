import type {
  MatchingCompletionResult,
  MatchingFirstChoice,
} from "@/lib/learningArtifacts/matchingGame";
import type { ConfidenceLevel } from "@/lib/mastery/updateMastery";

export const MATCHING_SESSION_STATE_KEY = "campus-coach:matching-session";

export interface MatchingResultConceptScore {
  conceptId: string;
  correct: boolean;
  confidence: ConfidenceLevel;
  recovered: boolean;
}

export interface MatchingResultRequestBody {
  attemptId: string;
  artifactId: string;
  correct: number;
  total: number;
  durationSeconds: number;
  confidence: ConfidenceLevel;
  matchingFirstChoices: MatchingFirstChoice[];
  perConcept: MatchingResultConceptScore[];
}

export interface MatchingSessionState {
  artifactId: string;
  attemptId: string;
  confidence: ConfidenceLevel;
  durationSeconds: number;
  completion: MatchingCompletionResult;
  frozenRequestBody: MatchingResultRequestBody | null;
}

interface ArtifactPairIdentity {
  id: string;
  conceptId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeMatchingSessionState(
  state: MatchingSessionState,
  explicitStorage?: Storage | null,
) {
  try {
    storage(explicitStorage)?.setItem(MATCHING_SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage availability must never interrupt a study interaction.
  }
}

export function clearMatchingSessionState(explicitStorage?: Storage | null) {
  try {
    storage(explicitStorage)?.removeItem(MATCHING_SESSION_STATE_KEY);
  } catch {
    // Best effort.
  }
}

export function readMatchingSessionState(options: {
  artifactId: string;
  pairs: readonly ArtifactPairIdentity[];
  storage?: Storage | null;
}): MatchingSessionState | null {
  let raw: string | null;
  try {
    raw = storage(options.storage)?.getItem(MATCHING_SESSION_STATE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)
      || !hasOnlyKeys(parsed, [
        "artifactId", "attemptId", "confidence", "durationSeconds", "completion",
        "frozenRequestBody",
      ])
      || parsed.artifactId !== options.artifactId
      || typeof parsed.attemptId !== "string"
      || !UUID_PATTERN.test(parsed.attemptId)
      || !isConfidence(parsed.confidence)
      || !isDuration(parsed.durationSeconds)) return null;

  const completion = validateCompletion(parsed.completion, options.pairs);
  if (!completion) return null;
  const expectedScores = completion.perConcept.map((score) => ({
    conceptId: score.conceptId,
    correct: score.firstAttemptCorrect,
    confidence: parsed.confidence as ConfidenceLevel,
    recovered: score.recovered,
  }));
  let frozenRequestBody: MatchingResultRequestBody | null = null;
  if (parsed.frozenRequestBody !== null) {
    if (!isRecord(parsed.frozenRequestBody)
        || !hasOnlyKeys(parsed.frozenRequestBody, [
          "attemptId", "artifactId", "correct", "total", "durationSeconds", "confidence",
          "matchingFirstChoices", "perConcept",
        ])) return null;
    const body = parsed.frozenRequestBody;
    if (body.attemptId !== parsed.attemptId
        || body.artifactId !== parsed.artifactId
        || body.correct !== completion.correctFirstAttempt
        || body.total !== completion.total
        || body.durationSeconds !== parsed.durationSeconds
        || body.confidence !== parsed.confidence
        || JSON.stringify(body.matchingFirstChoices) !== JSON.stringify(completion.firstChoices)
        || JSON.stringify(body.perConcept) !== JSON.stringify(expectedScores)) return null;
    frozenRequestBody = body as unknown as MatchingResultRequestBody;
  }

  return {
    artifactId: options.artifactId,
    attemptId: parsed.attemptId,
    confidence: parsed.confidence,
    durationSeconds: parsed.durationSeconds,
    completion,
    frozenRequestBody,
  };
}

function validateCompletion(
  value: unknown,
  pairs: readonly ArtifactPairIdentity[],
): MatchingCompletionResult | null {
  if (!isRecord(value)
      || !hasOnlyKeys(value, ["correctFirstAttempt", "total", "perConcept", "firstChoices"])
      || !Number.isInteger(value.correctFirstAttempt)
      || !Number.isInteger(value.total)
      || !Array.isArray(value.firstChoices)
      || !Array.isArray(value.perConcept)) return null;
  const pairById = new Map<string, ArtifactPairIdentity>();
  const conceptIds = new Set<string>();
  for (const pair of pairs) {
    if (!pair || typeof pair.id !== "string" || !pair.id
        || typeof pair.conceptId !== "string" || !pair.conceptId
        || pairById.has(pair.id) || conceptIds.has(pair.conceptId)) return null;
    pairById.set(pair.id, pair);
    conceptIds.add(pair.conceptId);
  }
  if (pairs.length < 3 || pairs.length > 6
      || value.total !== value.firstChoices.length
      || value.total < pairs.length - 1 || value.total > pairs.length) return null;

  const seenLeft = new Set<string>();
  const derived = new Map<string, { correct: boolean; recovered: boolean }>();
  let correct = 0;
  for (const rawChoice of value.firstChoices) {
    if (!isRecord(rawChoice)
        || !hasOnlyKeys(rawChoice, ["leftPairId", "rightPairId"])
        || typeof rawChoice.leftPairId !== "string"
        || typeof rawChoice.rightPairId !== "string"
        || seenLeft.has(rawChoice.leftPairId)) return null;
    const left = pairById.get(rawChoice.leftPairId);
    if (!left || !pairById.has(rawChoice.rightPairId)) return null;
    seenLeft.add(rawChoice.leftPairId);
    const isCorrect = rawChoice.leftPairId === rawChoice.rightPairId;
    if (isCorrect) correct += 1;
    derived.set(left.conceptId, { correct: isCorrect, recovered: !isCorrect });
  }
  if (correct !== value.correctFirstAttempt
      || (value.total === pairs.length && correct === pairs.length)
      || value.perConcept.length !== derived.size) return null;

  const seenConcepts = new Set<string>();
  for (const rawScore of value.perConcept) {
    if (!isRecord(rawScore)
        || !hasOnlyKeys(rawScore, ["conceptId", "firstAttemptCorrect", "recovered"])
        || typeof rawScore.conceptId !== "string"
        || seenConcepts.has(rawScore.conceptId)
        || typeof rawScore.firstAttemptCorrect !== "boolean"
        || typeof rawScore.recovered !== "boolean") return null;
    const expected = derived.get(rawScore.conceptId);
    if (!expected
        || rawScore.firstAttemptCorrect !== expected.correct
        || rawScore.recovered !== expected.recovered) return null;
    seenConcepts.add(rawScore.conceptId);
  }
  return value as unknown as MatchingCompletionResult;
}

function isConfidence(value: unknown): value is ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 86_400;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: object, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}
