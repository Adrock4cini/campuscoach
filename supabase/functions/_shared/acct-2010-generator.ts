import {
  ACCT_2010_META_NAMESPACE,
  type Acct2010ConceptSeed,
  type Acct2010RuntimeMap,
} from "./acct-2010-runtime.ts";

export interface Acct2010GeneratorRequest {
  kind: string;
  hasExplicitCapture: boolean;
  scopeType: "recent" | "exam" | "class";
  examTopics: readonly string[];
}

export interface Acct2010PersistedConceptShape {
  identity_key?: string | null;
  source_kind?: string | null;
  name: string;
  definition?: string | null;
  examples?: string[] | null;
  meta?: unknown;
}

export interface Acct2010CanonicalConceptFields {
  identity_key: Acct2010ConceptSeed["identityKey"];
  source_kind: "course-map-stable";
  name: string;
  definition: string;
  examples: string[];
  meta: Acct2010ConceptSeed["metadata"];
  topic_aliases: string[];
  curriculum_order: number;
}

type Acct2010CanonicalizedConcept<T> = T & Partial<Pick<
  Acct2010CanonicalConceptFields,
  "topic_aliases" | "curriculum_order"
>>;

/** Course foundations are opt-in class/exam material, never Capture/Tutor input. */
export function shouldActivateAcct2010Map(request: Acct2010GeneratorRequest): boolean {
  if (request.kind === "practice" || request.hasExplicitCapture) return false;
  if (request.scopeType === "class") return true;
  return request.scopeType === "exam"
    && request.examTopics.some((topic) => typeof topic === "string" && topic.trim().length > 0);
}

/** Exact service-RPC payload. It contains stable original copy only. */
export function serializeAcct2010ConceptSeeds(seeds: readonly Acct2010ConceptSeed[]) {
  return seeds.map((seed) => ({
    identityKey: seed.identityKey,
    name: seed.name,
    definition: seed.definition,
    examples: [...seed.examples],
    professorEmphasis: seed.professorEmphasis,
    sourceKind: seed.sourceKind,
    metadata: {
      courseMapVersion: seed.metadata.courseMapVersion,
      unitId: seed.metadata.unitId,
      topicAliases: [...seed.metadata.topicAliases],
    },
  }));
}

/**
 * Never trust mutable database prose for a reserved stable identity. The
 * bundled original map is canonical on every request; unknown/preempted rows
 * in the reserved namespace fail closed.
 */
export function canonicalizeAcct2010Concepts<T extends Acct2010PersistedConceptShape>(
  concepts: readonly T[],
  runtime: Acct2010RuntimeMap | null,
): Array<Acct2010CanonicalizedConcept<T>> {
  const seedByIdentity = new Map(
    (runtime?.conceptSeeds ?? []).map((seed) => [seed.identityKey, seed]),
  );
  const activeUnitIds = new Set(runtime?.activeUnitIds ?? []);

  return concepts.flatMap((concept) => {
    const identity = concept.identity_key ?? "";
    const reserved = concept.source_kind === "course-map-stable"
      || identity.startsWith("course-map:");
    if (!reserved) return [concept];

    const seed = seedByIdentity.get(identity as Acct2010ConceptSeed["identityKey"]);
    if (!seed || concept.source_kind !== "course-map-stable"
        || !activeUnitIds.has(seed.metadata.unitId)) return [];
    return [{
      ...concept,
      identity_key: seed.identityKey,
      source_kind: seed.sourceKind,
      name: seed.name,
      definition: seed.definition,
      examples: [],
      meta: seed.metadata,
      topic_aliases: [...seed.metadata.topicAliases],
      curriculum_order: seed.metadata.unitId,
    }];
  });
}

export function acct2010CourseMapSnapshot(
  concepts: readonly Acct2010PersistedConceptShape[],
  runtime: Acct2010RuntimeMap | null,
) {
  if (!runtime) return null;
  const unitByIdentity = new Map(
    runtime.conceptSeeds.map((seed) => [seed.identityKey, seed.metadata.unitId]),
  );
  const unitIds = [...new Set(concepts.flatMap((concept) => {
    if (concept.source_kind !== "course-map-stable" || !concept.identity_key) return [];
    const unitId = unitByIdentity.get(concept.identity_key as Acct2010ConceptSeed["identityKey"]);
    return unitId === undefined ? [] : [unitId];
  }))].sort((left, right) => left - right);
  if (!unitIds.length) return null;
  return {
    key: ACCT_2010_META_NAMESPACE.split(":")[0],
    version: runtime.conceptSeeds[0]?.metadata.courseMapVersion
      ?? "acct-2010-learning-map-v0",
    unitIds,
  };
}
