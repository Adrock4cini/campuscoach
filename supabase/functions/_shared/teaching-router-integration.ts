import {
  classifyLearningProblem,
  preferredStrategyForRoute,
  strategyTaskKindForRoute,
  type TeachingRoute,
} from "./teaching-router.ts";

export interface ArtifactTeachingConcept {
  id: string;
  name: string;
  definition?: string | null;
  examples?: string[] | null;
}

export interface ArtifactTeachingDecision {
  route: TeachingRoute;
  taskKind: ReturnType<typeof strategyTaskKindForRoute>;
  preferredStrategyId: string | null;
}

/**
 * Adapter for generate-artifact. It deliberately classifies from grounded
 * academic content, not from the UI format (flashcards/MC/matching).
 *
 * Student-confusion text may influence routing, but it is never promoted into
 * an answer. The caller remains responsible for the existing grounding and
 * teachable-content filters before passing source excerpts here.
 */
export function decideArtifactTeachingRoute(input: {
  concepts: ArtifactTeachingConcept[];
  sourceExcerptByConcept: Map<string, string>;
  topic?: string | null;
  studentConfusion?: string | null;
}): ArtifactTeachingDecision {
  const concept = input.concepts[0];
  const sourceExcerpt = concept
    ? input.sourceExcerptByConcept.get(concept.id) ?? null
    : null;
  const definition = concept?.definition ?? null;
  const examples = concept?.examples?.filter(Boolean).join(" \n ") ?? "";

  const route = classifyLearningProblem({
    conceptName: concept?.name ?? input.topic ?? null,
    definition,
    // Topic is a user-facing label and may contain logistics ("Test Friday")
    // or a broad action ("solve these"). It may name an otherwise empty
    // concept, but it must not contaminate classification of grounded source.
    sourceExcerpt: [sourceExcerpt, examples].filter(Boolean).join(" \n ") || null,
    studentConfusion: input.studentConfusion ?? null,
  });

  return {
    route,
    taskKind: strategyTaskKindForRoute(route),
    preferredStrategyId: preferredStrategyForRoute(route),
  };
}
