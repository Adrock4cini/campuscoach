import { CURRENT_ARTIFACT_PROMPT_VERSION, type StudyScope } from "./types";

export type MemoryTrickOrigin = "known" | "ai_created";

export type MemoryTrickTechnique =
  | "acronym"
  | "acrostic"
  | "first_letter_sentence"
  | "word_roots"
  | "sound_alike"
  | "familiar_bridge"
  | "visual"
  | "story"
  | "chunking"
  | "body_map"
  | "compare_contrast"
  | "rhyme"
  | "number_shape"
  | "worked_example"
  | "association"
  | "other";


export interface MemoryTrickContent {
  artifactId: string;
  origin: MemoryTrickOrigin;
  provenanceLabel: "Known memory trick" | "AI-created memory trick";
  technique: MemoryTrickTechnique;
  techniqueLabel: string;
  target: string;
  sourceExcerpt: string;
  mnemonic: string;
  howToUse: string;
  selfCheckPrompt: string;
  selfCheckAnswer: string;
}

export interface MemoryTrickBoundary {
  conceptId: string;
  conceptName: string;
  exactTarget: string;
  sourceExcerpt: string;
  classId: string;
  captureId?: string;
  studyScope: StudyScope;
}

const TECHNIQUE_LABELS: Record<MemoryTrickTechnique, string> = {
  acronym: "Acronym",
  acrostic: "Acrostic",
  first_letter_sentence: "First-letter sentence",
  word_roots: "Word roots",
  sound_alike: "Sound-alike",
  familiar_bridge: "Familiar bridge",
  visual: "Visual cue",
  story: "Mini story",
  chunking: "Chunking",
  body_map: "Body map",
  compare_contrast: "Compare and contrast",
  rhyme: "Rhyme",
  number_shape: "Number or shape",
  worked_example: "Worked example",
  association: "Association",
  other: "Memory cue",
};


function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maxLength = 600): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function technique(value: unknown): MemoryTrickTechnique | null {
  if (typeof value !== "string") return null;
  return Object.prototype.hasOwnProperty.call(TECHNIQUE_LABELS, value)
    ? value as MemoryTrickTechnique
    : null;
}

function origin(value: unknown): MemoryTrickOrigin | null {
  // `known` is reserved for a future curated library. The generator currently
  // emits `ai_created`; unknown values fail closed so authorship is never
  // overstated.
  return value === "known" || value === "ai_created" ? value : null;
}

/**
 * Validates an artifact at the final UI boundary. The query hook already
 * applies these filters, but repeating them here prevents a stale or malformed
 * response from crossing class, concept, or study-target boundaries.
 */
export function parseMemoryTrickArtifact(
  value: unknown,
  expected: MemoryTrickBoundary,
): MemoryTrickContent | null {
  const artifact = record(value);
  if (!artifact || artifact.kind !== "mnemonic" || artifact.stale !== false) return null;
  if (artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION) return null;
  if (artifact.client_class_id !== expected.classId) return null;
  if (artifact.study_scope_type !== expected.studyScope.type) return null;
  if (artifact.study_scope_id !== expected.studyScope.id) return null;

  const conceptIds = artifact.concept_ids;
  if (!Array.isArray(conceptIds) || conceptIds.length !== 1 || conceptIds[0] !== expected.conceptId) {
    return null;
  }

  const payload = record(artifact.payload);
  const items = payload?.items;
  if (!Array.isArray(items) || items.length !== 1) return null;
  const item = record(items[0]);
  if (!item || item.conceptId !== expected.conceptId) return null;
  if (text(item.conceptName, 300) !== text(expected.conceptName, 300)) return null;

  const target = text(item.target, 500);
  const itemSource = item.sourceExcerpt === undefined ? null : text(item.sourceExcerpt);
  if (!target || target !== text(expected.exactTarget, 500)) return null;

  const artifactId = text(artifact.id, 160);
  const mnemonic = text(item.mnemonic, 500);
  const howToUse = text(item.explanation, 600);
  const parsedTechnique = technique(item.technique);
  const parsedOrigin = origin(item.origin);
  if (!artifactId || !mnemonic || !howToUse || !parsedTechnique || !parsedOrigin) return null;

  return {
    artifactId,
    origin: parsedOrigin,
    provenanceLabel: parsedOrigin === "known"
      ? "Known memory trick"
      : "AI-created memory trick",
    technique: parsedTechnique,
    techniqueLabel: TECHNIQUE_LABELS[parsedTechnique],
    target,
    sourceExcerpt: itemSource ?? expected.sourceExcerpt,
    mnemonic,
    howToUse,
    selfCheckPrompt: `Without looking, what do you need to remember about ${expected.conceptName}?`,
    selfCheckAnswer: target,
  };
}

export function memoryTrickBoundaryKey(boundary: MemoryTrickBoundary) {
  return JSON.stringify({
    conceptId: boundary.conceptId,
    conceptName: boundary.conceptName,
    classId: boundary.classId,
    captureId: boundary.captureId ?? null,
    studyScope: boundary.studyScope,
    exactTarget: boundary.exactTarget,
    sourceExcerpt: boundary.sourceExcerpt,
  });
}
