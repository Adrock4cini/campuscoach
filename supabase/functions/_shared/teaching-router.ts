/**
 * Teaching Router v1.
 *
 * Classifies the LEARNING PROBLEM before choosing a study technique.
 * This is deliberately deterministic and cheap: AI may author a teaching aid
 * later, but it does not decide whether a percent problem is a procedure or
 * whether two commonly-confused terms should be contrasted.
 *
 * Important distinction:
 *   SOURCE   = what the student/professor supplied.
 *   ERROR    = what the student says they confuse or gets wrong.
 *   TEACHING = the intervention chosen here.
 *   EVIDENCE = an independent attempt after teaching.
 */

export type LearningProblemKind =
  | "solve-problems"
  | "compare-ideas"
  | "memorize-fact"
  | "memorize-terms"
  | "memorize-list"
  | "sequence-events"
  | "apply-procedure"
  | "understand-concept";

export type TeachingMove =
  | "student-attempt"
  | "hint"
  | "worked-example"
  | "faded-example"
  | "similar-problem"
  | "compare-table"
  | "discrimination-question"
  | "familiar-bridge"
  | "word-roots"
  | "retrieval-question"
  | "spacing"
  | "chunking"
  | "acronym"
  | "story-chain"
  | "timeline"
  | "analogy"
  | "visual";

export interface TeachingRouteInput {
  conceptName?: string | null;
  definition?: string | null;
  sourceExcerpt?: string | null;
  /** Student-authored confusion/error. This is evidence, never answer content. */
  studentConfusion?: string | null;
}

export interface TeachingRoute {
  kind: LearningProblemKind;
  moves: TeachingMove[];
  /** True when the source/error language strongly signals two ideas are confused. */
  confusable: boolean;
  /** Human-memory bridge is worth trying, subject to the mnemonic quality gate. */
  familiarBridgeEligible: boolean;
  reason: string;
}

const PERCENT_PROBLEM = /(?:\d+(?:\.\d+)?\s*(?:%|percent)\s+of\s+\$?\d+(?:\.\d+)?|\$\s*\d+(?:\.\d+)?[^.\n]{0,60}?\d+(?:\.\d+)?\s*(?:%|percent)\s*off)/i;
const EQUATION_PROBLEM = /(?:\bsolve\b[^\n]{0,80}\bfor\s+[a-z]\b|\b[a-z]\s*=|\d\s*[+\-*/×÷]\s*\d|=\s*\?)/i;
const PROCEDURE_SIGNAL = /\b(calculate|compute|solve|convert|determine|find|journalize|post|balance|derive|show your work|steps?)\b/i;
const COMPARE_SIGNAL = /\b(compare|contrast|difference|differentiate|distinguish|versus|\bvs\.?\b|mix(?:ed)? up|confus(?:e|ed|ing)|get(?:ting)? .* backwards|which one)\b/i;
const SEQUENCE_SIGNAL = /\b(first|second|third|next|then|finally|in order|sequence|stages?|steps? in order)\b/i;
const LIST_SIGNAL = /(?:\b(list|name|identify)\b[^.\n]{0,40}\b(?:three|four|five|six|seven|eight|3|4|5|6|7|8)\b|(?:[,;][^,;\n]+){2,})/i;
const DEFINITION_SIGNAL = /\b(means?|defined as|refers? to|is the|term|vocabulary|definition)\b/i;
const ROOT_FRIENDLY = /\b(hypo|hyper|endo|exo|intra|inter|pre|post|anti|pro|sub|super|micro|macro|bio|geo|photo|therm|cardio|neuro)\b/i;

function combined(input: TeachingRouteInput): string {
  return [input.conceptName, input.definition, input.sourceExcerpt, input.studentConfusion]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" \n ");
}

/**
 * Classify the learning problem. Order matters: a real solvable problem beats
 * generic vocabulary signals that may also appear in the same capture.
 */
export function classifyLearningProblem(input: TeachingRouteInput): TeachingRoute {
  const text = combined(input);
  const confusion = (input.studentConfusion ?? "").trim();
  const confusable = COMPARE_SIGNAL.test(`${confusion} ${text}`);

  if (PERCENT_PROBLEM.test(text) || EQUATION_PROBLEM.test(text) || PROCEDURE_SIGNAL.test(text)) {
    return {
      kind: "solve-problems",
      moves: ["student-attempt", "hint", "worked-example", "faded-example", "similar-problem"],
      confusable,
      familiarBridgeEligible: false,
      reason: "The source contains a concrete procedure or checkable problem, so doing and transferring beat memorizing.",
    };
  }

  if (confusable) {
    return {
      kind: "compare-ideas",
      moves: ["student-attempt", "compare-table", "familiar-bridge", "discrimination-question", "spacing"],
      confusable: true,
      familiarBridgeEligible: true,
      reason: "The student/source signals two neighbouring ideas are being confused; contrast and a lure-resistant choice test come first.",
    };
  }

  if (SEQUENCE_SIGNAL.test(text)) {
    return {
      kind: "sequence-events",
      moves: ["student-attempt", "chunking", "story-chain", "timeline", "retrieval-question", "spacing"],
      confusable: false,
      familiarBridgeEligible: false,
      reason: "The material is ordered; preserve order with chunks/chain before spaced retrieval.",
    };
  }

  if (LIST_SIGNAL.test(text)) {
    return {
      kind: "memorize-list",
      moves: ["student-attempt", "chunking", "acronym", "story-chain", "retrieval-question", "spacing"],
      confusable: false,
      familiarBridgeEligible: false,
      reason: "The material is a multi-item list; reduce memory load before retrieval.",
    };
  }

  if (DEFINITION_SIGNAL.test(text) || ROOT_FRIENDLY.test(text)) {
    return {
      kind: "memorize-terms",
      moves: ["student-attempt", "word-roots", "familiar-bridge", "visual", "retrieval-question", "spacing"],
      confusable: false,
      familiarBridgeEligible: true,
      reason: "The target is terminology; verified roots or familiar human anchors can cue it before retrieval.",
    };
  }

  // Short paired facts such as "Maryland — Annapolis" should not receive a
  // lecture. Prefer direct retrieval, then one-hop association if useful.
  const shortWords = text.trim().split(/\s+/).filter(Boolean).length;
  if (shortWords > 0 && shortWords <= 12) {
    return {
      kind: "memorize-fact",
      moves: ["student-attempt", "familiar-bridge", "retrieval-question", "spacing"],
      confusable: false,
      familiarBridgeEligible: true,
      reason: "This is a compact fact; a one-hop cue plus retrieval is cheaper than a long explanation.",
    };
  }

  return {
    kind: "understand-concept",
    moves: ["student-attempt", "analogy", "visual", "retrieval-question", "spacing"],
    confusable: false,
    familiarBridgeEligible: true,
    reason: "Default conceptual route: explain with a concrete representation, then require retrieval.",
  };
}

/** First toolbox strategy ID to request from the existing strategy catalog. */
export function preferredStrategyForRoute(route: TeachingRoute): string | null {
  switch (route.kind) {
    case "solve-problems": return "worked-example";
    case "compare-ideas": return "compare-table";
    case "memorize-list": return "chunk-list";
    case "sequence-events": return "story-chain";
    case "memorize-terms": return "familiar-bridge";
    case "memorize-fact": return "familiar-bridge";
    case "apply-procedure": return "worked-example";
    case "understand-concept": return "analogy";
    default: return null;
  }
}
