import {
  ACCT_2010_FALL_2026_SECTIONS,
  ACCT_2010_LEARNING_MAP_V0,
  ACCT_2010_STABLE_UNITS,
  type Acct2010ProfessorScope,
  type Acct2010SectionOverlay,
  unitsForConfirmedProfessorScope,
} from "./acct-2010-learning-map.ts";

/** Narrow class-meta namespace owned by Campus Companion Course Maps. */
export const ACCT_2010_META_NAMESPACE = "acct-2010:v0";

export interface Acct2010ClassContext {
  className?: string | null;
  classCode?: string | null;
  term?: string | null;
  section?: string | null;
  meta?: unknown;
}

export interface ParsedAcct2010ClassMeta {
  syllabusConfirmed: boolean;
  professorScope: Acct2010ProfessorScope;
}

export interface Acct2010ConceptSeed {
  identityKey: `course-map:acct-2010:v0:unit-${string}`;
  name: string;
  definition: string;
  examples: string[];
  professorEmphasis: false;
  sourceKind: "course-map-stable";
  metadata: {
    courseMapVersion: "acct-2010-learning-map-v0";
    unitId: number;
    /** Original Campus Companion labels only; never publisher terminology. */
    topicAliases: string[];
  };
}

export const ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS = [
  "flashcards",
  "multiple_choice",
  "matching",
] as const;

export type Acct2010DiagnosticArtifactKind =
  (typeof ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS)[number];

export interface Acct2010RuntimeMap {
  courseCode: "ACCT 2010";
  normalizedSection: string | null;
  fall2026StoreOverlay: Acct2010SectionOverlay | null;
  syllabusConfirmed: boolean;
  professorScope: Acct2010ProfessorScope;
  /** Request-local filtering only. Stable seeds are never deleted. */
  activeUnitIds: number[];
  diagnosticsEnabled: boolean;
  diagnosticArtifactKinds: readonly Acct2010DiagnosticArtifactKind[];
  /** Request-local original diagnostics; never persisted in concept examples. */
  diagnosticByIdentityKey: Record<string, string>;
  conceptSeeds: Acct2010ConceptSeed[];
}

const UNCONFIRMED_SCOPE: Acct2010ProfessorScope = {
  status: "unconfirmed",
  excludedUnitIds: [],
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function containsExactAcct2010(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").toUpperCase();
  return /(?:^|[^A-Z0-9])ACCT[\s-]*2010(?:$|[^A-Z0-9])/.test(normalized);
}

/** Recognizes the literal course identifier only; titles alone are not enough. */
export function isAcct2010Class(
  input: Pick<Acct2010ClassContext, "className" | "classCode">,
): boolean {
  return containsExactAcct2010(input.classCode) || containsExactAcct2010(input.className);
}

/**
 * Canonicalizes the known section shapes without guessing arbitrary values.
 * Numeric sections use three digits; branch/online sections use two letters
 * and one digit (for example AB1 or IO1).
 */
export function normalizeAcct2010Section(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.normalize("NFKC").trim().toUpperCase()
    .replace(/^SECTION\s+/i, "");
  if (/^\d{1,3}$/.test(stripped) && Number(stripped) > 0) {
    return stripped.padStart(3, "0");
  }
  if (/^[A-Z]{2}\d$/.test(stripped)) return stripped;
  return null;
}

/** Store metadata is valid only for the exact researched term and section. */
export function resolveAcct2010Fall2026Overlay(
  context: Acct2010ClassContext,
): Acct2010SectionOverlay | null {
  if (!isAcct2010Class(context) || context.term?.trim() !== "Fall 2026") return null;
  const sectionId = normalizeAcct2010Section(context.section);
  if (!sectionId) return null;
  return ACCT_2010_FALL_2026_SECTIONS.find((section) => section.sectionId === sectionId) ?? null;
}

/**
 * Reads only:
 * meta.campusCompanion.courseMaps["acct-2010:v0"]
 *
 * Any adjacent or malformed object is ignored. An invalid exclusion list does
 * not partially apply. Unit scope is confirmed only for the two launch units
 * the research packet says a professor may omit.
 */
export function parseAcct2010ClassMeta(meta: unknown): ParsedAcct2010ClassMeta {
  const root = record(meta);
  const campusCompanion = record(root?.campusCompanion);
  const courseMaps = record(campusCompanion?.courseMaps);
  const own = record(courseMaps?.[ACCT_2010_META_NAMESPACE]);
  const syllabusConfirmed = own?.syllabusConfirmed === true;
  const candidate = record(own?.professorScope);
  if (candidate?.status !== "confirmed"
      || (candidate.confirmationSource !== "student-syllabus"
        && candidate.confirmationSource !== "student-confirmation")
      || !Array.isArray(candidate.excludedUnitIds)
      || candidate.excludedUnitIds.some((unitId) => unitId !== 14 && unitId !== 15)) {
    return { syllabusConfirmed, professorScope: UNCONFIRMED_SCOPE };
  }

  const excludedUnitIds = [...new Set(candidate.excludedUnitIds as Array<14 | 15>)]
    .sort((left, right) => left - right) as Array<14 | 15>;
  return {
    syllabusConfirmed,
    professorScope: {
      status: "confirmed",
      confirmationSource: candidate.confirmationSource,
      excludedUnitIds,
    },
  };
}

function stableDefinition(unit: (typeof ACCT_2010_STABLE_UNITS)[number]): string {
  return [...unit.focus, unit.misconception.correction].join(" ");
}

function conceptIdentityKey(unitId: number): Acct2010ConceptSeed["identityKey"] {
  return `course-map:acct-2010:v0:unit-${String(unitId).padStart(2, "0")}`;
}

/**
 * Pure launch adapter for later generate-artifact/database wiring.
 *
 * It returns null for every other course. Stable persistence is invariant:
 * all 15 concepts always return, with empty examples and stable-only metadata.
 * Professor scope and any homework-shaped diagnostics remain request-local.
 */
export function buildAcct2010RuntimeMap(
  context: Acct2010ClassContext,
): Acct2010RuntimeMap | null {
  if (!isAcct2010Class(context)) return null;

  const normalizedSection = normalizeAcct2010Section(context.section);
  const parsedMeta = parseAcct2010ClassMeta(context.meta);
  const fall2026StoreOverlay = resolveAcct2010Fall2026Overlay(context);
  const activeUnits = unitsForConfirmedProfessorScope(parsedMeta.professorScope);
  // A merely well-shaped section is not course intelligence. Diagnostics need
  // either the exact researched term+known-section overlay or an explicitly
  // namespaced student/syllabus confirmation.
  const diagnosticsEnabled = parsedMeta.syllabusConfirmed || fall2026StoreOverlay !== null;
  const activeUnitIds = activeUnits.map((unit) => unit.id);
  const activeUnitIdSet = new Set(activeUnitIds);
  const diagnosticByIdentityKey = diagnosticsEnabled
    ? Object.fromEntries(
        ACCT_2010_STABLE_UNITS
          .filter((unit) => activeUnitIdSet.has(unit.id))
          .map((unit) => [conceptIdentityKey(unit.id), unit.diagnosticStem]),
      )
    : {};

  return {
    courseCode: "ACCT 2010",
    normalizedSection,
    fall2026StoreOverlay,
    syllabusConfirmed: parsedMeta.syllabusConfirmed,
    professorScope: parsedMeta.professorScope,
    activeUnitIds,
    diagnosticsEnabled,
    diagnosticArtifactKinds: ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS,
    diagnosticByIdentityKey,
    conceptSeeds: ACCT_2010_STABLE_UNITS.map((unit) => ({
      identityKey: conceptIdentityKey(unit.id),
      name: unit.title,
      definition: stableDefinition(unit),
      // Request-local diagnostics must never cross this persistence boundary.
      examples: [],
      professorEmphasis: false,
      sourceKind: "course-map-stable",
      metadata: {
        courseMapVersion: ACCT_2010_LEARNING_MAP_V0.schemaVersion,
        unitId: unit.id,
        topicAliases: [unit.title, ...unit.focus],
      },
    })),
  };
}
