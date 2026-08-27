import { extractAssignmentTutorSource } from "./assignment-tutor.ts";

export const MAX_GROUNDED_EXCERPT_CHARS = 360;

export interface GroundedExcerptConcept {
  id: string;
  name: string;
  definition?: string | null;
  examples?: string[] | null;
  capture_id?: string | null;
}

export interface CaptureGroundingSource {
  kind: string | null;
  // Kept in the policy input so tests can prove that assignment OCR is never
  // selected. The assignment branch below intentionally never reads it.
  raw_text?: string | null;
  practice_source_status?: string | null;
  practice_source_text?: string | null;
  practice_source_version?: number | null;
  practice_source_hash?: string | null;
  practice_concept_id?: string | null;
}

export interface CaptureGroundingSourceRow extends CaptureGroundingSource {
  id: string;
}

export type CaptureGroundingDecision =
  | { kind: "ordinary-capture" }
  | { kind: "assignment-confirmation-required" }
  | {
      kind: "confirmed-assignment";
      sourceText: string;
      sourceVersion: number;
      sourceHash: string;
      practiceConceptId: string;
    };

/**
 * Selects the only source that may ground a photographed assignment.
 *
 * `raw_text` is immutable OCR evidence, not student-confirmed academic text.
 * Callers must fail closed for `assignment-confirmation-required`; they must
 * never fall back to OCR merely because an artifact is not the Tutor kind.
 */
export function selectCaptureGroundingSource(
  capture: CaptureGroundingSource,
): CaptureGroundingDecision {
  if (capture.kind !== "scan-assignment") return { kind: "ordinary-capture" };

  const sourceText = capture.practice_source_text;
  const sourceVersion = capture.practice_source_version;
  const sourceHash = capture.practice_source_hash;
  const practiceConceptId = capture.practice_concept_id;
  if (
    capture.practice_source_status !== "confirmed"
    || typeof sourceText !== "string"
    || !sourceText.length
    || sourceText.length > MAX_GROUNDED_EXCERPT_CHARS
    || sourceText !== sourceText.trim()
    || !Number.isInteger(sourceVersion)
    || (sourceVersion as number) < 1
    || typeof sourceHash !== "string"
    || !/^[0-9a-f]{64}$/.test(sourceHash)
    || typeof practiceConceptId !== "string"
    || !practiceConceptId
  ) {
    return { kind: "assignment-confirmation-required" };
  }

  return {
    kind: "confirmed-assignment",
    sourceText,
    sourceVersion: sourceVersion as number,
    sourceHash,
    practiceConceptId,
  };
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "before",
  "being", "between", "could", "does", "from", "have", "into", "more",
  "most", "that", "their", "then", "there", "these", "they", "this",
  "through", "using", "was", "were", "what", "when", "where", "which",
  "while", "with", "would", "your",
]);

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function comparisonKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function trimAtBoundary(value: string, maxChars: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) return normalized;
  const candidate = normalized.slice(0, Math.max(1, maxChars - 1));
  const boundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("; "),
    candidate.lastIndexOf(", "),
    candidate.lastIndexOf(" "),
  );
  const safe = boundary >= Math.floor(maxChars * 0.55)
    ? candidate.slice(0, boundary + (candidate[boundary] === "." ? 1 : 0))
    : candidate;
  return `${safe.trimEnd()}…`;
}

export function boundGroundedText(
  value: string,
  maxChars = MAX_GROUNDED_EXCERPT_CHARS,
) {
  return trimAtBoundary(value, Math.max(40, maxChars));
}

function sentenceChunks(raw: string, chunkLimit: number) {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalized];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const clean = normalizeWhitespace(sentence);
    if (!clean) continue;
    if (clean.length <= chunkLimit) {
      chunks.push(clean);
      continue;
    }
    let remainder = clean;
    while (remainder.length) {
      const chunk = trimAtBoundary(remainder, chunkLimit);
      chunks.push(chunk);
      const consumed = chunk.endsWith("…") ? chunk.length - 1 : chunk.length;
      remainder = normalizeWhitespace(remainder.slice(Math.max(1, consumed)));
    }
  }
  return chunks;
}

function meaningfulTerms(concept: GroundedExcerptConcept) {
  return new Set(
    [concept.name, concept.definition, ...(concept.examples ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
      ?? [],
  );
}

function symbolicFacts(concept: GroundedExcerptConcept) {
  const text = [concept.name, concept.definition, ...(concept.examples ?? [])]
    .filter(Boolean)
    .join(" ")
    .replace(/[xX*]/g, "×")
    .replace(/\//g, "÷");
  return new Set(
    (text.match(/-?(?:\d+(?:\.\d+)?|\.\d+)\s*[+\-×÷]\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*=\s*-?(?:\d+(?:\.\d+)?|\.\d+)/g) ?? [])
      .map((fact) => fact.replace(/\s+/g, "")),
  );
}

function assignmentTutorProblemKey(value: string) {
  const extracted = extractAssignmentTutorSource(value);
  const concept = extracted?.concepts[0];
  return concept ? comparisonKey(`${concept.name}|${concept.definition}`) : null;
}

function solvableProblemKeys(concept: GroundedExcerptConcept) {
  const keys = new Set<string>();
  for (const candidate of [concept.name, concept.definition, ...(concept.examples ?? [])]) {
    if (!candidate) continue;
    const key = assignmentTutorProblemKey(candidate);
    if (key) keys.add(key);
  }
  return keys;
}

function normalizedLexicalText(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

function containsPhrase(text: string, phrase: string) {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function excerptRelevance(
  chunk: string,
  conceptName: string,
  terms: Set<string>,
  facts: Set<string>,
  problems: Set<string>,
) {
  const compactChunk = chunk.replace(/[xX*]/g, "×").replace(/\//g, "÷").replace(/\s+/g, "");
  const symbolicMatch = [...facts].some((fact) => compactChunk.includes(fact));
  const chunkProblemKey = assignmentTutorProblemKey(chunk);
  const problemMatch = Boolean(chunkProblemKey && problems.has(chunkProblemKey));
  const words = new Set(chunk.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  let termOverlap = 0;
  for (const term of terms) if (words.has(term)) termOverlap += 1;
  const conceptNameMatch = containsPhrase(
    normalizedLexicalText(chunk),
    normalizedLexicalText(conceptName),
  );
  return {
    relevant: symbolicMatch || problemMatch || conceptNameMatch || termOverlap >= 2,
    score: symbolicMatch ? 100 : problemMatch ? 90 : conceptNameMatch ? Math.max(50, termOverlap) : termOverlap,
  };
}

/**
 * Produces small, source-faithful excerpts without attaching an entire OCR or
 * transcript to every concept. A raw chunk can be assigned only once, even if
 * extraction created several concepts from the same capture.
 */
export function buildGroundedExcerptMap(
  concepts: GroundedExcerptConcept[],
  rawSourceByCapture: Map<string, string>,
  maxChars = MAX_GROUNDED_EXCERPT_CHARS,
) {
  const result = new Map<string, string>();
  const usedChunks = new Set<string>();
  const boundedMax = Math.max(80, Math.min(800, Math.trunc(maxChars)));
  const chunkLimit = Math.max(80, Math.min(220, boundedMax));

  for (const concept of concepts) {
    // One concept may have several occurrence records. Keep the first
    // grounded occurrence selected by the caller's deterministic ordering.
    if (result.has(concept.id)) continue;
    if (!concept.capture_id) continue;
    const raw = rawSourceByCapture.get(concept.capture_id);
    if (!raw?.trim()) continue;
    const terms = meaningfulTerms(concept);
    const facts = symbolicFacts(concept);
    const problems = solvableProblemKeys(concept);
    const ranked = sentenceChunks(raw, chunkLimit)
      .map((chunk, index) => ({
        chunk,
        index,
        ...excerptRelevance(chunk, concept.name, terms, facts, problems),
      }))
      // A same-capture sentence is not automatically evidence for every
      // extracted concept. Accept an exact symbolic fact, the full normalized
      // concept name, or at least two meaningful overlapping terms. A lone
      // generic word such as "cell" must not turn "cell phone" into biology
      // evidence.
      .filter(({ chunk, relevant }) => relevant && !usedChunks.has(comparisonKey(chunk)))
      .sort((left, right) => right.score - left.score || left.index - right.index);

    const selected: string[] = [];
    let length = 0;
    for (const candidate of ranked) {
      const separator = selected.length ? 1 : 0;
      if (length + separator + candidate.chunk.length > boundedMax) continue;
      selected.push(candidate.chunk);
      length += separator + candidate.chunk.length;
      usedChunks.add(comparisonKey(candidate.chunk));
      // One local chunk per concept prevents an early concept from consuming
      // the best evidence for a sibling concept extracted from the same page.
      break;
    }
    if (selected.length) result.set(concept.id, selected.join(" "));
  }
  return result;
}

/**
 * Applies capture source policy before matching source excerpts to concepts.
 * Mixed class/recent study deliberately excludes assignment photos entirely:
 * their confirmed problem is Tutor-only, while their OCR is never gradeable.
 * A concept shared with notes/material may still use that independent source.
 */
export function buildCapturePolicyGroundedExcerptMap(
  concepts: GroundedExcerptConcept[],
  captures: CaptureGroundingSourceRow[],
  options: {
    captureIdsByConcept?: ReadonlyMap<string, readonly string[]>;
    maxChars?: number;
  } = {},
) {
  const sourceByCapture = new Map<string, string>();

  for (const capture of captures) {
    if (capture.kind === "scan-assignment") continue;
    const raw = capture.raw_text?.trim();
    if (raw) sourceByCapture.set(capture.id, raw);
  }

  const sourceOccurrences = concepts.flatMap((concept) => {
    const evidenceCaptureIds = options.captureIdsByConcept?.get(concept.id);
    const captureIds = evidenceCaptureIds?.length
      ? evidenceCaptureIds
      : concept.capture_id
        ? [concept.capture_id]
        : [];
    return captureIds
      .filter((captureId) => sourceByCapture.has(captureId))
      .map((captureId) => ({ ...concept, capture_id: captureId }));
  });
  return buildGroundedExcerptMap(
    sourceOccurrences,
    sourceByCapture,
    options.maxChars ?? MAX_GROUNDED_EXCERPT_CHARS,
  );
}

/** Returns an exact, bounded fact for a mnemonic to preserve verbatim. */
export function buildExactMnemonicTarget(
  concept: GroundedExcerptConcept,
  sourceExcerpt?: string,
) {
  const candidates = [
    sourceExcerpt,
    concept.definition,
    ...(concept.examples ?? []),
    concept.name,
  ];
  const target = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return target ? boundGroundedText(target, 500) : "";
}
