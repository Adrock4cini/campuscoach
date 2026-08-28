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

const ROUTE_PRIORITY: Record<TeachingRoute["kind"], number> = {
  "compare-ideas": 80,
  "solve-problems": 70,
  "apply-procedure": 65,
  "sequence-events": 60,
  "memorize-list": 50,
  "memorize-terms": 40,
  "understand-concept": 30,
  "memorize-fact": 20,
};

function routeForConcept(
  concept: ArtifactTeachingConcept,
  sourceExcerptByConcept: Map<string, string>,
  studentConfusion?: string | null,
): TeachingRoute {
  const sourceExcerpt = sourceExcerptByConcept.get(concept.id) ?? null;
  const examples = concept.examples?.filter(Boolean).join(" \n ") ?? "";
  return classifyLearningProblem({
    conceptName: concept.name,
    definition: concept.definition ?? null,
    sourceExcerpt: [sourceExcerpt, examples].filter(Boolean).join(" \n ") || null,
    studentConfusion: studentConfusion ?? null,
  });
}

/**
 * Adapter for generate-artifact. It deliberately classifies from grounded
 * academic content, not from the UI format (flashcards/MC/matching).
 *
 * Every selected concept participates. This matters for sets containing a
 * confusable pair or a procedure alongside a short fact: routing from only the
 * first concept can silently choose memorization for material that requires
 * discrimination or doing. A student's explicit confusion is applied to each
 * candidate route and the strongest learning need wins.
 *
 * Student-confusion text may influence routing, but it is never promoted into
 * an answer. The caller remains responsible for grounding and teachable-content
 * filters before passing source excerpts here.
 */
export function decideArtifactTeachingRoute(input: {
  concepts: ArtifactTeachingConcept[];
  sourceExcerptByConcept: Map<string, string>;
  topic?: string | null;
  studentConfusion?: string | null;
}): ArtifactTeachingDecision {
  const routes = input.concepts.map((concept) => (
    routeForConcept(concept, input.sourceExcerptByConcept, input.studentConfusion)
  ));

  // An empty concept set should still fail conservatively into conceptual
  // teaching rather than deriving pedagogy from a possibly logistical topic.
  const route = routes.length
    ? routes.reduce((best, candidate) => (
        ROUTE_PRIORITY[candidate.kind] > ROUTE_PRIORITY[best.kind] ? candidate : best
      ))
    : classifyLearningProblem({
        conceptName: null,
        definition: null,
        sourceExcerpt: null,
        studentConfusion: input.studentConfusion ?? null,
      });

  return {
    route,
    taskKind: strategyTaskKindForRoute(route),
    preferredStrategyId: preferredStrategyForRoute(route),
  };
}
