import { boundGroundedText } from "./grounded-excerpt.ts";
import { isNonExplanatoryFragment } from "./grounding-quality.ts";
import { buildExactThinMultipleChoice, extractExactThinSource } from "./thin-source.ts";

export type GeneratedArtifactKind =
  | "flashcards"
  | "multiple_choice"
  | "matching"
  | "mnemonic";

/**
 * Reusable memory-technique catalog.
 *
 * The trick itself is still authored by the model against grounded source
 * text, but the family is chosen from this fixed list so the generator does
 * not reinvent (or repeat) technique types on every request, and so student
 * "helpful / try another" feedback aggregates into stable buckets.
 */
export const MNEMONIC_TECHNIQUE_CATALOG = [
  { id: "acronym", use: "the fact is a true list whose first letters form a word" },
  { id: "acrostic", use: "the fact is an ordered list; make a first-letter sentence" },
  { id: "first_letter_sentence", use: "a long ordered sequence needs a silly sentence cue" },
  { id: "word_roots", use: "the term's real, verifiable root or literal meaning is stated in the source; never invent an origin" },
  { id: "sound_alike", use: "the term sounds like a common word the student already knows" },
  { id: "familiar_bridge", use: "an everyday object, place, or routine maps cleanly onto the fact" },
  { id: "visual", use: "one vivid, slightly absurd mental picture locks the fact in" },
  { id: "story", use: "several linked details are easier to keep as a short chain or scene" },
  { id: "chunking", use: "a long string or list splits into 2-4 memorable groups" },
  { id: "body_map", use: "the fact is anatomical, spatial, or positional" },
  { id: "compare_contrast", use: "the fact is easily confused with a neighbouring term" },
  { id: "rhyme", use: "a short rhyme or rhythm carries the fact" },
  { id: "number_shape", use: "a number, count, or value is the thing to remember" },
  { id: "worked_example", use: "math/science: a tiny pattern or worked step beats a word trick" },
  { id: "association", use: "a direct link to something already known fits best" },
  { id: "other", use: "nothing above fits; still keep it short and concrete" },
] as const;

export const MNEMONIC_TECHNIQUES = MNEMONIC_TECHNIQUE_CATALOG.map(
  (entry) => entry.id,
) as unknown as readonly MnemonicTechnique[];

export type MnemonicTechnique = (typeof MNEMONIC_TECHNIQUE_CATALOG)[number]["id"];

export interface ArtifactValidationConcept {
  id: string;
  name: string;
}

export interface DeterministicMatchingConcept extends ArtifactValidationConcept {
  definition?: string | null;
  examples?: string[] | null;
}

export interface DeterministicStudyConcept extends DeterministicMatchingConcept {
  professor_emphasis?: boolean | null;
}

export interface ArtifactValidationOptions {
  concepts: ArtifactValidationConcept[];
  expectedCount: number;
  sourceExcerptByConcept?: Map<string, string>;
  exactTargetByConcept?: Map<string, string>;
  /** Allows a strictly validated 1-6 AI remainder before final 3-6 assembly. */
  allowPartialMatching?: boolean;
}

export type ArtifactValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

export interface MnemonicFeedbackRow {
  technique?: string | null;
  helpful?: boolean | null;
}

export interface MnemonicTechniquePreferences {
  hasFeedback: boolean;
  preferred: MnemonicTechnique[];
  avoid: MnemonicTechnique[];
}

/**
 * Builds answer-bearing cards without asking a model to author academic facts.
 * The back is either the exact captured equation/excerpt or durable concept
 * text; the model remains reserved for a memory aid around that fixed target.
 */
export function buildDeterministicFlashcards(
  concepts: DeterministicStudyConcept[],
  sourceExcerptByConcept: Map<string, string>,
  limit: number,
) {
  const cards: Array<Record<string, unknown>> = [];
  const seenPrompts = new Set<string>();
  const boundedLimit = Math.max(0, Math.min(8, Math.trunc(limit)));
  for (const concept of concepts) {
    if (cards.length >= boundedLimit) break;
    const source = sourceExcerptByConcept.get(concept.id)?.trim();
    const exact = source ? extractExactThinSource(source, Boolean(concept.professor_emphasis)) : null;
    const front = exact?.question
      ?? boundGroundedText(`Explain ${concept.name} in your own words.`, 240);
    const back = exact?.answer
      ?? boundGroundedText(
        source
          || concept.definition?.trim()
          || concept.examples?.find((example) => example.trim())
          || "",
        800,
      );
    const promptKey = duplicateKey(front);
    // A heading, running head, or "© Publisher 159" page fragment is not an
    // answer. Skipping it keeps the set honest instead of teaching furniture.
    if (!back || isNonExplanatoryFragment(back) || seenPrompts.has(promptKey)) continue;
    seenPrompts.add(promptKey);
    cards.push({
      front,
      back,
      conceptId: concept.id,
      conceptName: concept.name,
      ...(source ? { sourceExcerpt: source } : {}),
    });
  }
  return cards;
}

/**
 * Builds four-choice retrieval questions with a server-selected exact answer.
 * Adjacent source facts are used as distractors; bounded meta-decoys fill any
 * remaining slots without asserting invented academic content.
 */
export function buildDeterministicMultipleChoice(
  concepts: DeterministicStudyConcept[],
  sourceExcerptByConcept: Map<string, string>,
  limit: number,
) {
  const questions: Array<Record<string, unknown>> = [];
  const seenPrompts = new Set<string>();
  const exactTargets = concepts.map((concept) => ({
    concept,
    target: boundGroundedText(
      sourceExcerptByConcept.get(concept.id)?.trim()
        || concept.definition?.trim()
        || concept.examples?.find((example) => example.trim())
        || "",
      220,
    ),
  })).filter((entry) => entry.target);
  const safeDecoys = [
    "Not stated in the provided class material",
    "There is not enough information in the source",
    "This statement describes a different topic",
  ];
  const boundedLimit = Math.max(0, Math.min(8, Math.trunc(limit)));

  for (const [index, entry] of exactTargets.entries()) {
    if (questions.length >= boundedLimit) break;
    const { concept, target } = entry;
    const source = sourceExcerptByConcept.get(concept.id)?.trim();
    const exact = source ? buildExactThinMultipleChoice(source) : null;
    if (exact) {
      questions.push({
        ...exact,
        conceptId: concept.id,
        conceptName: concept.name,
        sourceExcerpt: source,
      });
      continue;
    }

    const prompt = boundGroundedText(
      `Which statement matches ${concept.name} in your class material?`,
      500,
    );
    const promptKey = duplicateKey(prompt);
    if (seenPrompts.has(promptKey)) continue;
    seenPrompts.add(promptKey);
    const distractors = [...exactTargets.map((candidate) => candidate.target), ...safeDecoys]
      .filter((candidate, candidateIndex, all) => (
        duplicateKey(candidate) !== duplicateKey(target)
        && all.findIndex((value) => duplicateKey(value) === duplicateKey(candidate)) === candidateIndex
      ))
      .slice(0, 3);
    if (distractors.length < 3) continue;
    const answerIndex = index % 4;
    const choices = [...distractors];
    choices.splice(answerIndex, 0, target);
    questions.push({
      prompt,
      choices,
      answerIndex,
      rationale: boundGroundedText(`Your class material states: ${source || target}`, 500),
      conceptId: concept.id,
      conceptName: concept.name,
      ...(source ? { sourceExcerpt: source } : {}),
    });
  }
  return questions;
}

/**
 * Uses durable concept memory before paying a model to paraphrase it. The
 * caller sends only unhandled concepts to AI and validates the assembled game.
 */
export function buildDeterministicMatchingPairs(
  concepts: DeterministicMatchingConcept[],
  sourceExcerptByConcept: Map<string, string>,
  limit: number,
) {
  const pairs: Array<Record<string, unknown>> = [];
  const handledConceptIds = new Set<string>();
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();
  const boundedLimit = Math.max(0, Math.min(6, Math.trunc(limit)));

  for (const concept of concepts) {
    if (pairs.length >= boundedLimit) break;
    const left = boundGroundedText(concept.name, 160);
    const leftKey = duplicateKey(left);
    if (!left || seenLeft.has(leftKey)) continue;
    const right = [
      sourceExcerptByConcept.get(concept.id),
      concept.definition,
      ...(concept.examples ?? []),
    ]
      .filter((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()))
      .map((candidate) => boundGroundedText(candidate, 500))
      .find((candidate) => {
        const key = duplicateKey(candidate);
        const vague = /^(?:please\s+)?(?:review|study|learn|remember|help|explain)\b/i.test(candidate);
        return !vague && key !== leftKey && !seenRight.has(key);
      });
    if (!right) continue;
    seenLeft.add(leftKey);
    seenRight.add(duplicateKey(right));
    handledConceptIds.add(concept.id);
    pairs.push({
      left,
      right,
      conceptId: concept.id,
      conceptName: concept.name,
    });
  }
  return { pairs, handledConceptIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key));
}

function cleanString(
  value: unknown,
  field: string,
  min: number,
  max: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: `${field} must be text` };
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < min || clean.length > max) {
    return { ok: false, error: `${field} must be ${min}-${max} characters` };
  }
  return { ok: true, value: clean };
}

function duplicateKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function validateRoot(
  raw: unknown,
  rootKey: "cards" | "questions" | "pairs" | "items",
  expectedCount: number,
) {
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 8) {
    return { error: "expected count must be a whole number from 1-8" } as const;
  }
  if (!isRecord(raw) || !hasOnlyKeys(raw, [rootKey])) {
    return { error: `payload must contain only '${rootKey}'` } as const;
  }
  const items = raw[rootKey];
  if (!Array.isArray(items) || items.length !== expectedCount) {
    return { error: `${rootKey} must contain exactly ${expectedCount} items` } as const;
  }
  return { items } as const;
}

function conceptForItem(
  item: Record<string, unknown>,
  conceptById: Map<string, ArtifactValidationConcept>,
  seenConcepts: Set<string>,
) {
  if (typeof item.conceptId !== "string") return { error: "conceptId is required" } as const;
  const concept = conceptById.get(item.conceptId);
  if (!concept) return { error: "conceptId is not in the selected study scope" } as const;
  if (seenConcepts.has(concept.id)) return { error: "a concept cannot appear twice" } as const;
  if (typeof item.conceptName !== "string" || item.conceptName.trim() !== concept.name.trim()) {
    return { error: "conceptName does not match conceptId" } as const;
  }
  seenConcepts.add(concept.id);
  return { concept } as const;
}

function canonicalExcerpt(
  item: Record<string, unknown>,
  conceptId: string,
  sourceExcerptByConcept?: Map<string, string>,
) {
  const expected = sourceExcerptByConcept?.get(conceptId);
  if (expected && expected.length > 360) {
    return { error: "sourceExcerpt exceeds the grounded excerpt limit" } as const;
  }
  if (item.sourceExcerpt !== undefined) {
    if (typeof item.sourceExcerpt !== "string" || !expected || item.sourceExcerpt.trim() !== expected.trim()) {
      return { error: "sourceExcerpt must be the exact server-selected excerpt" } as const;
    }
  }
  return expected ? { value: expected } as const : { value: undefined } as const;
}

function withExcerpt<T extends Record<string, unknown>>(item: T, excerpt?: string) {
  return excerpt ? { ...item, sourceExcerpt: excerpt } : item;
}

function validateFlashcards(raw: unknown, options: ArtifactValidationOptions): ArtifactValidationResult {
  const root = validateRoot(raw, "cards", options.expectedCount);
  if ("error" in root) return { ok: false, error: root.error };
  const conceptById = new Map(options.concepts.map((concept) => [concept.id, concept]));
  const seenConcepts = new Set<string>();
  const seenFronts = new Set<string>();
  const cards: Array<Record<string, unknown>> = [];

  for (const rawItem of root.items) {
    if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, [
      "front", "back", "conceptId", "conceptName", "sourceExcerpt",
    ])) return { ok: false, error: "flashcard has unsupported fields" };
    const linked = conceptForItem(rawItem, conceptById, seenConcepts);
    if ("error" in linked) return { ok: false, error: linked.error };
    const front = cleanString(rawItem.front, "front", 3, 240);
    if ("error" in front) return { ok: false, error: front.error };
    const back = cleanString(rawItem.back, "back", 1, 800);
    if ("error" in back) return { ok: false, error: back.error };
    const frontKey = duplicateKey(front.value);
    if (seenFronts.has(frontKey)) return { ok: false, error: "flashcard prompts must be unique" };
    seenFronts.add(frontKey);
    const excerpt = canonicalExcerpt(rawItem, linked.concept.id, options.sourceExcerptByConcept);
    if ("error" in excerpt) return { ok: false, error: excerpt.error };
    cards.push(withExcerpt({
      front: front.value,
      back: back.value,
      conceptId: linked.concept.id,
      conceptName: linked.concept.name,
    }, excerpt.value));
  }
  return { ok: true, payload: { cards } };
}

function validateMultipleChoice(raw: unknown, options: ArtifactValidationOptions): ArtifactValidationResult {
  const root = validateRoot(raw, "questions", options.expectedCount);
  if ("error" in root) return { ok: false, error: root.error };
  const conceptById = new Map(options.concepts.map((concept) => [concept.id, concept]));
  const seenConcepts = new Set<string>();
  const seenPrompts = new Set<string>();
  const questions: Array<Record<string, unknown>> = [];

  for (const rawItem of root.items) {
    if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, [
      "prompt", "choices", "answerIndex", "rationale", "conceptId", "conceptName", "sourceExcerpt",
    ])) return { ok: false, error: "multiple-choice question has unsupported fields" };
    const linked = conceptForItem(rawItem, conceptById, seenConcepts);
    if ("error" in linked) return { ok: false, error: linked.error };
    const prompt = cleanString(rawItem.prompt, "prompt", 3, 500);
    if ("error" in prompt) return { ok: false, error: prompt.error };
    const promptKey = duplicateKey(prompt.value);
    if (seenPrompts.has(promptKey)) return { ok: false, error: "question prompts must be unique" };
    seenPrompts.add(promptKey);
    if (!Array.isArray(rawItem.choices) || rawItem.choices.length !== 4) {
      return { ok: false, error: "choices must contain exactly four answers" };
    }
    const choices: string[] = [];
    const seenChoices = new Set<string>();
    for (const rawChoice of rawItem.choices) {
      const choice = cleanString(rawChoice, "choice", 1, 240);
      if ("error" in choice) return { ok: false, error: choice.error };
      const key = duplicateKey(choice.value);
      if (seenChoices.has(key)) return { ok: false, error: "answer choices must be unique" };
      seenChoices.add(key);
      choices.push(choice.value);
    }
    if (!Number.isInteger(rawItem.answerIndex) || Number(rawItem.answerIndex) < 0 || Number(rawItem.answerIndex) > 3) {
      return { ok: false, error: "answerIndex must be a whole number from 0-3" };
    }
    const rationale = cleanString(rawItem.rationale, "rationale", 1, 500);
    if ("error" in rationale) return { ok: false, error: rationale.error };
    const excerpt = canonicalExcerpt(rawItem, linked.concept.id, options.sourceExcerptByConcept);
    if ("error" in excerpt) return { ok: false, error: excerpt.error };
    questions.push(withExcerpt({
      prompt: prompt.value,
      choices,
      answerIndex: Number(rawItem.answerIndex),
      rationale: rationale.value,
      conceptId: linked.concept.id,
      conceptName: linked.concept.name,
    }, excerpt.value));
  }
  return { ok: true, payload: { questions } };
}

function validateMatching(raw: unknown, options: ArtifactValidationOptions): ArtifactValidationResult {
  const minimum = options.allowPartialMatching ? 1 : 3;
  if (options.expectedCount < minimum || options.expectedCount > 6) {
    return { ok: false, error: "matching needs 3-6 pairs" };
  }
  const root = validateRoot(raw, "pairs", options.expectedCount);
  if ("error" in root) return { ok: false, error: root.error };
  const conceptById = new Map(options.concepts.map((concept) => [concept.id, concept]));
  const seenConcepts = new Set<string>();
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();
  const pairs: Array<Record<string, unknown>> = [];

  for (const rawItem of root.items) {
    if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, [
      "id", "left", "right", "conceptId", "conceptName", "sourceExcerpt",
    ])) return { ok: false, error: "matching pair has unsupported fields" };
    const linked = conceptForItem(rawItem, conceptById, seenConcepts);
    if ("error" in linked) return { ok: false, error: linked.error };
    const canonicalId = `match-${linked.concept.id}`;
    if (rawItem.id !== undefined && rawItem.id !== canonicalId) {
      return { ok: false, error: "matching pair id does not match its concept" };
    }
    const left = cleanString(rawItem.left, "left", 1, 160);
    if ("error" in left) return { ok: false, error: left.error };
    const right = cleanString(rawItem.right, "right", 1, 500);
    if ("error" in right) return { ok: false, error: right.error };
    const leftKey = duplicateKey(left.value);
    const rightKey = duplicateKey(right.value);
    if (seenLeft.has(leftKey) || seenRight.has(rightKey)) {
      return { ok: false, error: "matching terms and answers must be unique" };
    }
    seenLeft.add(leftKey);
    seenRight.add(rightKey);
    const excerpt = canonicalExcerpt(rawItem, linked.concept.id, options.sourceExcerptByConcept);
    if ("error" in excerpt) return { ok: false, error: excerpt.error };
    pairs.push(withExcerpt({
      id: canonicalId,
      conceptId: linked.concept.id,
      conceptName: linked.concept.name,
      left: left.value,
      right: right.value,
    }, excerpt.value));
  }
  return { ok: true, payload: { pairs } };
}

function validateMnemonic(raw: unknown, options: ArtifactValidationOptions): ArtifactValidationResult {
  const root = validateRoot(raw, "items", options.expectedCount);
  if ("error" in root) return { ok: false, error: root.error };
  if (!options.exactTargetByConcept) return { ok: false, error: "mnemonic exact targets are required" };
  const conceptById = new Map(options.concepts.map((concept) => [concept.id, concept]));
  const seenConcepts = new Set<string>();
  const seenMnemonics = new Set<string>();
  const items: Array<Record<string, unknown>> = [];

  for (const rawItem of root.items) {
    if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, [
      "target", "mnemonic", "technique", "explanation", "conceptId", "conceptName", "sourceExcerpt",
    ])) return { ok: false, error: "mnemonic has unsupported fields" };
    const linked = conceptForItem(rawItem, conceptById, seenConcepts);
    if ("error" in linked) return { ok: false, error: linked.error };
    const exactTarget = options.exactTargetByConcept.get(linked.concept.id);
    if (
      !exactTarget
      || exactTarget.length > 500
      || typeof rawItem.target !== "string"
      || duplicateKey(rawItem.target) !== duplicateKey(exactTarget)
    ) {
      return { ok: false, error: "mnemonic target must copy the exact grounded fact" };
    }

    const mnemonic = cleanString(rawItem.mnemonic, "mnemonic", 3, 500);
    if ("error" in mnemonic) return { ok: false, error: mnemonic.error };
    if (duplicateKey(mnemonic.value) === duplicateKey(exactTarget)) {
      return { ok: false, error: "mnemonic must remain separate from the fact" };
    }
    const mnemonicKey = duplicateKey(mnemonic.value);
    if (seenMnemonics.has(mnemonicKey)) return { ok: false, error: "mnemonics must be unique" };
    seenMnemonics.add(mnemonicKey);
    if (typeof rawItem.technique !== "string" || !MNEMONIC_TECHNIQUES.includes(rawItem.technique as MnemonicTechnique)) {
      return { ok: false, error: "mnemonic technique is invalid" };
    }
    const explanation = cleanString(rawItem.explanation, "explanation", 3, 500);
    if ("error" in explanation) return { ok: false, error: explanation.error };
    const excerpt = canonicalExcerpt(rawItem, linked.concept.id, options.sourceExcerptByConcept);
    if ("error" in excerpt) return { ok: false, error: excerpt.error };
    items.push(withExcerpt({
      id: `mnemonic-${linked.concept.id}`,
      conceptId: linked.concept.id,
      conceptName: linked.concept.name,
      target: exactTarget,
      mnemonic: mnemonic.value,
      technique: rawItem.technique,
      origin: "ai_created",
      explanation: explanation.value,
    }, excerpt.value));
  }
  return { ok: true, payload: { items } };
}

export function validateArtifactPayload(
  kind: GeneratedArtifactKind,
  raw: unknown,
  options: ArtifactValidationOptions,
): ArtifactValidationResult {
  if (kind === "flashcards") return validateFlashcards(raw, options);
  if (kind === "multiple_choice") return validateMultipleChoice(raw, options);
  if (kind === "matching") return validateMatching(raw, options);
  return validateMnemonic(raw, options);
}

export function aggregateMnemonicTechniqueFeedback(
  rows: MnemonicFeedbackRow[],
): MnemonicTechniquePreferences {
  const scores = new Map<MnemonicTechnique, number>();
  let validRows = 0;
  for (const row of rows.slice(0, 200)) {
    if (typeof row.technique !== "string" || !MNEMONIC_TECHNIQUES.includes(row.technique as MnemonicTechnique)) {
      continue;
    }
    if (typeof row.helpful !== "boolean") continue;
    validRows += 1;
    const technique = row.technique as MnemonicTechnique;
    scores.set(technique, (scores.get(technique) ?? 0) + (row.helpful ? 1 : -1));
  }
  const ordered = [...scores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
  return {
    hasFeedback: validRows > 0,
    preferred: ordered.filter(([, score]) => score > 0).slice(0, 3).map(([technique]) => technique),
    avoid: ordered.filter(([, score]) => score < 0).reverse().slice(0, 3).map(([technique]) => technique),
  };
}
