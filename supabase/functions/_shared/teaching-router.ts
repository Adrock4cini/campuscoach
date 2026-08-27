/**
 * Teaching Router v1.
 *
 * Cheap deterministic classification happens before strategy selection or an
 * AI call. SOURCE is not TEACHING; a student's stated ERROR is evidence, not
 * answer content; EVIDENCE comes from an independent attempt after teaching.
 */
export type LearningProblemKind =
  | "solve-problems" | "compare-ideas" | "memorize-fact" | "memorize-terms"
  | "memorize-list" | "sequence-events" | "apply-procedure" | "understand-concept";

export type TeachingMove =
  | "student-attempt" | "hint" | "worked-example" | "faded-example" | "similar-problem"
  | "compare-table" | "discrimination-question" | "familiar-bridge" | "word-roots"
  | "retrieval-question" | "spacing" | "chunking" | "acronym" | "story-chain"
  | "timeline" | "analogy" | "visual";

export interface TeachingRouteInput {
  conceptName?: string | null;
  definition?: string | null;
  sourceExcerpt?: string | null;
  studentConfusion?: string | null;
}
export interface TeachingRoute {
  kind: LearningProblemKind;
  moves: TeachingMove[];
  confusable: boolean;
  familiarBridgeEligible: boolean;
  reason: string;
}

const PERCENT_PROBLEM = /(?:\d+(?:\.\d+)?\s*(?:%|percent)\s+of\s+\$?\d+(?:\.\d+)?|\$\s*\d+(?:\.\d+)?[^.\n]{0,60}?\d+(?:\.\d+)?\s*(?:%|percent)\s*off)/i;
const EQUATION_PROBLEM = /(?:\bsolve\b[^\n]{0,80}\bfor\s+[a-z]\b|\b[a-z]\s*=|\d\s*[+\-*/×÷]\s*\d|=\s*\?)/i;
const PROCEDURE_SIGNAL = /\b(calculate|compute|solve|convert|determine|find|journalize|post|balance|derive|show your work|steps?)\b/i;
const COMPARE_SIGNAL = /(?:\b(compare|contrast|difference|differentiate|distinguish|versus|mix(?:ed)? up|confus(?:e|ed|ing)|which one)\b|\bvs\.?\b|\bget(?:ting)?\b[^.\n]{0,40}\bbackwards\b)/i;
const SEQUENCE_SIGNAL = /\b(first|second|third|next|then|finally|in order|sequence|stages?|steps? in order)\b/i;
const LIST_SIGNAL = /(?:\b(list|name|identify)\b[^.\n]{0,40}\b(?:three|four|five|six|seven|eight|3|4|5|6|7|8)\b|(?:[,;][^,;\n]+){2,})/i;
const DEFINITION_SIGNAL = /\b(means?|defined as|refers? to|is the|term|vocabulary|definition)\b/i;
const ROOT_FRIENDLY = /\b(hypo|hyper|endo|exo|intra|inter|pre|post|anti|pro|sub|super|micro|macro|bio|geo|photo|therm|cardio|neuro)\b/i;

function combined(input: TeachingRouteInput): string {
  return [input.conceptName, input.definition, input.sourceExcerpt, input.studentConfusion]
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim())).join(" \n ");
}

export function classifyLearningProblem(input: TeachingRouteInput): TeachingRoute {
  const text = combined(input);
  const confusable = COMPARE_SIGNAL.test(`${input.studentConfusion ?? ""} ${text}`);
  if (PERCENT_PROBLEM.test(text) || EQUATION_PROBLEM.test(text) || PROCEDURE_SIGNAL.test(text)) return {
    kind: "solve-problems", moves: ["student-attempt", "hint", "worked-example", "faded-example", "similar-problem"],
    confusable, familiarBridgeEligible: false,
    reason: "Concrete procedure/checkable problem: doing and transfer beat memorizing.",
  };
  if (confusable) return {
    kind: "compare-ideas", moves: ["student-attempt", "compare-table", "familiar-bridge", "discrimination-question", "spacing"],
    confusable: true, familiarBridgeEligible: true,
    reason: "Neighbouring ideas are confused: contrast and a lure-resistant choice test come first.",
  };
  if (SEQUENCE_SIGNAL.test(text)) return {
    kind: "sequence-events", moves: ["student-attempt", "chunking", "story-chain", "timeline", "retrieval-question", "spacing"],
    confusable: false, familiarBridgeEligible: false, reason: "Ordered material: preserve order before retrieval.",
  };
  if (LIST_SIGNAL.test(text)) return {
    kind: "memorize-list", moves: ["student-attempt", "chunking", "acronym", "story-chain", "retrieval-question", "spacing"],
    confusable: false, familiarBridgeEligible: false, reason: "Multi-item list: reduce memory load before retrieval.",
  };
  if (DEFINITION_SIGNAL.test(text) || ROOT_FRIENDLY.test(text)) return {
    kind: "memorize-terms", moves: ["student-attempt", "word-roots", "familiar-bridge", "visual", "retrieval-question", "spacing"],
    confusable: false, familiarBridgeEligible: true, reason: "Terminology: verified roots/familiar anchors can cue retrieval.",
  };
  const shortWords = text.trim().split(/\s+/).filter(Boolean).length;
  if (shortWords > 0 && shortWords <= 12) return {
    kind: "memorize-fact", moves: ["student-attempt", "familiar-bridge", "retrieval-question", "spacing"],
    confusable: false, familiarBridgeEligible: true, reason: "Compact fact: one-hop cue plus retrieval beats a lecture.",
  };
  return {
    kind: "understand-concept", moves: ["student-attempt", "analogy", "visual", "retrieval-question", "spacing"],
    confusable: false, familiarBridgeEligible: true, reason: "Conceptual route: concrete representation then retrieval.",
  };
}

/** Map router output onto IDs that already exist in STRATEGY_CATALOG. */
export function preferredStrategyForRoute(route: TeachingRoute): string | null {
  switch (route.kind) {
    case "solve-problems": return "worked-example";
    case "compare-ideas": return "compare-table";
    case "memorize-list": return "acronym";
    case "sequence-events": return "mini-story";
    case "memorize-terms": return "word-roots";
    case "memorize-fact": return "familiar-bridge";
    case "apply-procedure": return "worked-example";
    case "understand-concept": return "familiar-bridge";
    default: return null;
  }
}

/** Existing strategy catalog does not yet have first-class kinds for these. */
export function strategyTaskKindForRoute(route: TeachingRoute):
  "memorize-terms" | "understand-concept" | "solve-problems" | "sequence-events" | "compare-ideas" | "apply-procedure" {
  switch (route.kind) {
    case "solve-problems": return "solve-problems";
    case "compare-ideas": return "compare-ideas";
    case "memorize-list":
    case "memorize-fact":
    case "memorize-terms": return "memorize-terms";
    case "sequence-events": return "sequence-events";
    case "apply-procedure": return "apply-procedure";
    default: return "understand-concept";
  }
}
