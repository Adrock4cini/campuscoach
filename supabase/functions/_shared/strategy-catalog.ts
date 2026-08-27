/**
 * Personal Learning Toolbox — curated strategy catalog.
 *
 * This is a SELECTION MENU for the existing Study Intelligence path, never a
 * second ranking algorithm and never a learner-type label. Nothing here says
 * "this student is a visual learner": a strategy is chosen from the content,
 * the subject profile, the student's explicit request, accessibility needs,
 * and what has actually worked for that student on that kind of task.
 *
 * Cost discipline:
 *   - `deterministic` strategies are built from the catalog and the student's
 *     own grounded material. Zero model calls.
 *   - `ai` strategies require one Lovable AI Gateway call and are only used
 *     when the student asks for them or a cached artifact is missing/rejected.
 *
 * Accuracy discipline: every entry carries `safety`, which is injected into
 * generation prompts. Strategies that could fabricate (diagrams, etymology,
 * "secret tricks") state their verification requirement explicitly, and
 * `requiresGroundedSource` strategies are dropped when no source excerpt
 * exists for the concept.
 *
 * Mirrored to the app through `src/lib/study/strategyToolbox.ts`.
 */

import { getSubjectProfile, type SubjectProfileId } from "./subject-profiles.ts";
import {
  evidenceAdjustment,
  evidenceNote,
  type StrategyEvidence,
} from "./strategy-evidence.ts";

export type StrategyModality =
  | "visual"
  | "verbal"
  | "association"
  | "shortcut"
  | "practice";

export type StrategyCost = "deterministic" | "ai";

export type StudyTaskKind =
  | "memorize-terms"
  | "understand-concept"
  | "solve-problems"
  | "sequence-events"
  | "compare-ideas"
  | "apply-procedure";

export interface Strategy {
  id: string;
  label: string;
  modality: StrategyModality;
  /** Mnemonic technique family this maps to, when it produces a memory aid. */
  technique?: string;
  /** What the student sees on a contextual action chip, if offered. */
  actionLabel?: string;
  /** Task kinds this strategy is good at. */
  taskKinds: StudyTaskKind[];
  /** Subject profiles this fits especially well. Empty = broadly useful. */
  subjects: SubjectProfileId[];
  whenToUse: string;
  avoidWhen: string;
  cost: StrategyCost;
  /** Accuracy / anti-fabrication constraint, injected into prompts. */
  safety: string;
  /** Drop the strategy when the concept has no grounded excerpt. */
  requiresGroundedSource: boolean;
}

export const STRATEGY_CATALOG: readonly Strategy[] = [
  /* ---------------------------- Visual ---------------------------- */
  {
    id: "simple-diagram",
    label: "Simple labeled diagram",
    modality: "visual",
    technique: "visual",
    actionLabel: "Map it out in words",
    taskKinds: ["understand-concept", "apply-procedure"],
    subjects: ["physical_science", "life_science", "computing", "art_design"],
    whenToUse: "The source describes parts, flow, or structure that can be drawn from facts already in the text.",
    avoidWhen: "The source only states a definition, or the parts and relationships are not spelled out.",
    cost: "ai",
    safety: "Describe only components and relationships stated in the source. Never invent a part, arrow, label, or step. If the source is too thin to draw, say so instead of guessing.",
    requiresGroundedSource: true,
  },
  {
    id: "body-map",
    label: "Body or location map",
    modality: "visual",
    technique: "body_map",
    actionLabel: "Map it on the body",
    taskKinds: ["memorize-terms", "understand-concept"],
    subjects: ["life_science"],
    whenToUse: "Terms attach to a physical location, structure, or hands-on step the student can point to.",
    avoidWhen: "The material is abstract with no physical referent.",
    cost: "ai",
    safety: "Anatomical locations must come from the source. Never relocate a structure to make a cue work.",
    requiresGroundedSource: true,
  },
  {
    id: "timeline",
    label: "Timeline",
    modality: "visual",
    technique: "chunking",
    actionLabel: "Put it on a timeline",
    taskKinds: ["sequence-events"],
    subjects: ["history_social"],
    whenToUse: "Two or more dated or ordered events appear in the source.",
    avoidWhen: "Only one event exists, or the ordering is not stated.",
    cost: "ai",
    safety: "Use only dates and events present in the source, in the order the source gives. Never infer or interpolate a date.",
    requiresGroundedSource: true,
  },
  {
    id: "compare-table",
    label: "Compare and contrast table",
    modality: "visual",
    technique: "compare_contrast",
    actionLabel: "Show the differences",
    taskKinds: ["compare-ideas", "understand-concept"],
    subjects: [],
    whenToUse: "Two or more things in the source are easy to confuse with each other.",
    avoidWhen: "Only one item exists, or the differences are not stated in the source.",
    cost: "deterministic",
    safety: "Every cell must trace to source wording. Label a missing cell as not stated rather than filling it in. Never rely on color alone to carry meaning — use labels and position.",
    requiresGroundedSource: true,
  },
  {
    id: "mental-image",
    label: "Vivid mental image",
    modality: "visual",
    technique: "visual",
    actionLabel: "Visualize it",
    taskKinds: ["memorize-terms"],
    subjects: [],
    whenToUse: "A term is abstract and needs a concrete hook to become memorable.",
    avoidWhen: "The student needs the procedure or reasoning, not recall of a label.",
    cost: "ai",
    safety: "The image may be invented; the fact it points to may not. State the exact fact alongside the image.",
    requiresGroundedSource: true,
  },

  /* --------------------------- Sound / verbal --------------------------- */
  {
    id: "read-aloud",
    label: "Read it aloud",
    modality: "verbal",
    actionLabel: "Read it aloud",
    taskKinds: ["memorize-terms", "understand-concept"],
    subjects: [],
    whenToUse: "The student is reviewing text and would benefit from hearing it; uses the browser's built-in speech synthesis only.",
    avoidWhen: "The device has no speech synthesis, or the student is in a quiet setting.",
    cost: "deterministic",
    safety: "Speak the grounded text verbatim. No added commentary, no paid audio service.",
    requiresGroundedSource: false,
  },
  {
    id: "teach-back",
    label: "Teach it back (Feynman)",
    modality: "verbal",
    actionLabel: "Let me explain it",
    taskKinds: ["understand-concept", "compare-ideas"],
    subjects: [],
    whenToUse: "The student half-knows it and needs to find the gap in their own explanation.",
    avoidWhen: "They have not encountered the material yet — there is nothing to explain.",
    cost: "deterministic",
    safety: "Prompt only; never grade a spoken answer the app cannot hear.",
    requiresGroundedSource: false,
  },
  {
    id: "speak-it-back",
    label: "Say the answer out loud",
    modality: "verbal",
    actionLabel: "Say it out loud",
    taskKinds: ["memorize-terms"],
    subjects: ["music", "humanities_text"],
    whenToUse: "Pronunciation, phrasing, or verbatim recall matters.",
    avoidWhen: "The student is somewhere they cannot speak.",
    cost: "deterministic",
    safety: "Show the exact target wording after the attempt so self-scoring stays honest.",
    requiresGroundedSource: true,
  },
  {
    id: "rhyme-rhythm",
    label: "Rhyme or rhythm",
    modality: "verbal",
    technique: "rhyme",
    taskKinds: ["memorize-terms", "sequence-events"],
    subjects: ["music", "life_science"],
    whenToUse: "A short fixed list or ordering needs to stick.",
    avoidWhen: "The material is quantitative or the rhyme would distort the fact.",
    cost: "ai",
    safety: "Never bend a fact, number, or spelling to make a rhyme work.",
    requiresGroundedSource: true,
  },

  /* --------------------------- Association --------------------------- */
  {
    id: "sound-alike",
    label: "Sound-alike hook",
    modality: "association",
    technique: "sound_alike",
    taskKinds: ["memorize-terms"],
    subjects: [],
    whenToUse: "An unfamiliar term sounds like a familiar word.",
    avoidWhen: "The sound-alike could be mistaken for the real meaning.",
    cost: "ai",
    safety: "State clearly that the sound-alike is a memory hook, not the definition.",
    requiresGroundedSource: true,
  },
  {
    id: "familiar-bridge",
    label: "Bridge to something familiar",
    modality: "association",
    technique: "familiar_bridge",
    actionLabel: "Compare it to something I know",
    taskKinds: ["understand-concept"],
    subjects: [],
    whenToUse: "A new idea maps cleanly onto everyday experience.",
    avoidWhen: "The analogy would import properties the real concept does not have.",
    cost: "ai",
    safety: "Name where the analogy breaks down. An analogy is never presented as the definition.",
    requiresGroundedSource: true,
  },
  {
    id: "word-roots",
    label: "Real word roots",
    modality: "association",
    technique: "word_roots",
    taskKinds: ["memorize-terms"],
    subjects: ["life_science", "humanities_text"],
    whenToUse: "The genuine root or affix is stated in the source or is a well-established, verifiable morpheme (for example cardio- = heart).",
    avoidWhen: "The etymology is uncertain, disputed, or would have to be invented — then use a sound-alike instead.",
    cost: "ai",
    safety: "Never invent an etymology. If the root cannot be stated with confidence, switch strategies rather than guess.",
    requiresGroundedSource: true,
  },
  {
    id: "mini-story",
    label: "Mini story",
    modality: "association",
    technique: "story",
    taskKinds: ["sequence-events", "memorize-terms"],
    subjects: ["history_social", "culinary"],
    whenToUse: "Several items must be recalled in order.",
    avoidWhen: "A single isolated fact — a story adds load with no payoff.",
    cost: "ai",
    safety: "The story is a container. Every fact inside it must be exactly as the source states it.",
    requiresGroundedSource: true,
  },
  {
    id: "acronym",
    label: "Acronym or first-letter sentence",
    modality: "association",
    technique: "acronym",
    taskKinds: ["memorize-terms", "sequence-events"],
    subjects: ["business_accounting", "life_science"],
    whenToUse: "A fixed list of 3-7 items must be recalled completely.",
    avoidWhen: "Order does not matter and the items are already meaningful, or the list is long enough that the acronym is harder than the list.",
    cost: "ai",
    safety: "Each letter must map to a real item from the source, with no filler letters.",
    requiresGroundedSource: true,
  },

  /* ---------------------- Shortcuts / 'secret tricks' ---------------------- */
  {
    id: "verified-math-shortcut",
    label: "Verified mental-math shortcut",
    modality: "shortcut",
    technique: "worked_example",
    actionLabel: "Show a math shortcut",
    taskKinds: ["solve-problems"],
    subjects: ["math", "physical_science", "business_accounting", "culinary"],
    whenToUse: "The problem matches a transformation that is provably valid, such as a% of b = b% of a.",
    avoidWhen: "No catalog shortcut matches — do not invent one.",
    cost: "deterministic",
    safety: "Only shortcuts from the verified shortcut module ship, each with its reason and its conditions. Numeric self-check runs before display. Never present a shortcut as magic.",
    requiresGroundedSource: false,
  },
  {
    id: "pattern-spotting",
    label: "Spot the pattern",
    modality: "shortcut",
    technique: "chunking",
    taskKinds: ["solve-problems", "apply-procedure"],
    subjects: ["math", "computing", "physical_science"],
    whenToUse: "Several worked items in the source share the same structure.",
    avoidWhen: "Only one example exists — one point is not a pattern.",
    cost: "ai",
    safety: "Describe only the pattern the source's own examples show, and state when it stops applying.",
    requiresGroundedSource: true,
  },
  {
    id: "unit-conversion-check",
    label: "Unit and conversion check",
    modality: "shortcut",
    taskKinds: ["solve-problems", "apply-procedure"],
    subjects: ["physical_science", "math", "culinary", "life_science"],
    whenToUse: "The problem carries units or requires a conversion.",
    avoidWhen: "The material has no quantities.",
    cost: "deterministic",
    safety: "Conversion factors must come from the source. Never supply a remembered factor the class did not give.",
    requiresGroundedSource: false,
  },
  {
    id: "sanity-check",
    label: "Test-taking sanity check",
    modality: "shortcut",
    taskKinds: ["solve-problems", "apply-procedure"],
    subjects: [],
    whenToUse: "Right before a test, or when the student keeps losing points to slips rather than concepts.",
    avoidWhen: "The student does not yet know the method — checking cannot rescue a missing concept.",
    cost: "deterministic",
    safety: "Generic checking habits only. Never claim to predict what will be on the test.",
    requiresGroundedSource: false,
  },

  /* ---------------------------- Practice forms ---------------------------- */
  {
    id: "worked-example",
    label: "Worked example",
    modality: "practice",
    technique: "worked_example",
    actionLabel: "Walk me through an example",
    taskKinds: ["solve-problems", "apply-procedure"],
    subjects: ["math", "physical_science", "business_accounting", "computing"],
    whenToUse: "The student is new to the procedure and needs to see every step once.",
    avoidWhen: "They can already do it — watching more examples stops adding value.",
    cost: "ai",
    safety: "Every step and number must come from the source's own example. Never fabricate a result.",
    requiresGroundedSource: true,
  },
  {
    id: "faded-example",
    label: "Faded example (finish the step)",
    modality: "practice",
    taskKinds: ["solve-problems", "apply-procedure"],
    subjects: ["math", "physical_science", "computing", "business_accounting"],
    whenToUse: "The student has seen a worked example and needs to take over part of it.",
    avoidWhen: "They have not seen the full solution yet.",
    cost: "ai",
    safety: "Remove a step from a grounded worked example; never remove a step from an invented one.",
    requiresGroundedSource: true,
  },
  {
    id: "error-spotting",
    label: "Spot the error",
    modality: "practice",
    taskKinds: ["solve-problems", "compare-ideas"],
    subjects: ["math", "computing", "business_accounting", "humanities_text"],
    whenToUse: "The student makes the same mistake repeatedly and needs to recognize it cold.",
    avoidWhen: "They are still learning the correct version — seeing errors first can stick.",
    cost: "ai",
    safety: "The corrected version must match the source exactly, and the error must be clearly flagged as wrong.",
    requiresGroundedSource: true,
  },
  {
    id: "retrieval-question",
    label: "Retrieval question",
    modality: "practice",
    taskKinds: ["memorize-terms", "understand-concept"],
    subjects: [],
    whenToUse: "Default. Recalling from memory beats rereading for almost every subject.",
    avoidWhen: "Never — this is the safe fallback.",
    cost: "deterministic",
    safety: "Question and answer come straight from the grounded concept record.",
    requiresGroundedSource: false,
  },
  {
    id: "multiple-choice",
    label: "Multiple choice",
    modality: "practice",
    taskKinds: ["understand-concept", "compare-ideas"],
    subjects: [],
    whenToUse: "The student needs to discriminate between close options, the way a test asks.",
    avoidWhen: "They cannot produce the answer at all yet.",
    cost: "deterministic",
    safety: "Distractors are drawn from sibling concepts in the same class, never invented facts.",
    requiresGroundedSource: false,
  },
  {
    id: "matching",
    label: "Matching",
    modality: "practice",
    taskKinds: ["memorize-terms", "compare-ideas"],
    subjects: [],
    whenToUse: "A set of terms pairs with a set of definitions or functions.",
    avoidWhen: "Fewer than three solid pairs exist.",
    cost: "deterministic",
    safety: "Pairs come from grounded concept records only.",
    requiresGroundedSource: false,
  },
  {
    id: "ordering",
    label: "Put the steps in order",
    modality: "practice",
    taskKinds: ["sequence-events", "apply-procedure"],
    subjects: ["history_social", "culinary", "life_science", "computing"],
    whenToUse: "The source states an explicit sequence of steps or events.",
    avoidWhen: "The order is not stated — do not impose one.",
    cost: "ai",
    safety: "Use the source's own sequence. Never reorder or add a step.",
    requiresGroundedSource: true,
  },
  {
    id: "scenario-application",
    label: "Apply it to a scenario",
    modality: "practice",
    taskKinds: ["apply-procedure", "understand-concept"],
    subjects: ["life_science", "business_accounting", "culinary", "history_social"],
    whenToUse: "The student knows the definition and needs to use it in a realistic situation.",
    avoidWhen: "The definition is not solid yet.",
    cost: "ai",
    safety: "The scenario may be new; the rule being applied must be the source's rule, quoted or paraphrased faithfully.",
    requiresGroundedSource: true,
  },
];

export const STRATEGY_BY_ID: Record<string, Strategy> = Object.fromEntries(
  STRATEGY_CATALOG.map((strategy) => [strategy.id, strategy]),
);

export const FALLBACK_STRATEGY_ID = "retrieval-question";

/** Maps a mnemonic technique family back to the strategy that produces it. */
export function strategyIdForTechnique(technique: string | null | undefined): string | null {
  if (!technique) return null;
  return STRATEGY_CATALOG.find((strategy) => strategy.technique === technique)?.id ?? null;
}

export interface StrategyObservations {
  /** Technique/strategy families the student has marked helpful. */
  preferred?: string[];
  /** Techniques/strategies the student rejected via "Try another". */
  avoid?: string[];
  /** Strategy ids already shown for this exact concept in this session. */
  alreadyShown?: string[];
}

export interface StrategySelectionContext {
  subjectProfileId?: SubjectProfileId | null;
  taskKind?: StudyTaskKind;
  /** Soft content-based default from Teaching Router; never an explicit ask. */
  routerPreferredStrategyId?: string;
  /** Student explicitly asked for a modality ("Visualize it"). */
  requestedModality?: StrategyModality;
  /** Student explicitly asked for one strategy id. */
  requestedStrategyId?: string;
  hasGroundedSource?: boolean;
  /** Suppress strategies whose only channel is one the student cannot use. */
  unavailableModalities?: StrategyModality[];
  observations?: StrategyObservations;
  /**
   * Recency-weighted, sample-gated effectiveness derived from this student's
   * own outcomes. Meaningful evidence can outrank cold-start subject defaults;
   * thin or absent evidence changes nothing.
   */
  evidence?: readonly StrategyEvidence[];
  /** Only return strategies that need no model call. */
  deterministicOnly?: boolean;
}

export interface StrategyChoice {
  strategy: Strategy;
  score: number;
  /** Internal explanation of why this strategy ranked where it did. */
  reasons: string[];
  /** The learned evidence that moved this choice, when any did. */
  evidence?: StrategyEvidence | null;
  /** Compact, non-labeling student copy. Null when there is nothing to say. */
  note?: string | null;
}

/**
 * Ranks catalog strategies for one moment. Deterministic and cheap — this runs
 * before any model call and decides whether a model call is needed at all.
 */
export function selectStrategies(context: StrategySelectionContext): StrategyChoice[] {
  const profile = getSubjectProfile(context.subjectProfileId ?? null);
  const observations = context.observations ?? {};
  const preferred = new Set(observations.preferred ?? []);
  const avoid = new Set(observations.avoid ?? []);
  const shown = new Set(observations.alreadyShown ?? []);
  const unavailable = new Set(context.unavailableModalities ?? []);
  const hasSource = context.hasGroundedSource !== false;

  const catalogRank = new Map(STRATEGY_CATALOG.map((strategy, index) => [strategy.id, index]));

  const choices: StrategyChoice[] = [];
  for (const strategy of STRATEGY_CATALOG) {
    if (context.requestedStrategyId && strategy.id !== context.requestedStrategyId) continue;
    if (unavailable.has(strategy.modality)) continue;
    if (context.deterministicOnly && strategy.cost !== "deterministic") continue;
    if (strategy.requiresGroundedSource && !hasSource) continue;

    const reasons: string[] = [];
    let score = 1;

    if (context.requestedStrategyId === strategy.id) {
      score += 8;
      reasons.push("student asked for this strategy");
    }
    if (context.requestedModality && strategy.modality === context.requestedModality) {
      score += 5;
      reasons.push(`student asked for a ${context.requestedModality} approach`);
    }
    if (context.taskKind && strategy.taskKinds.includes(context.taskKind)) {
      score += 3;
      reasons.push(`fits the ${context.taskKind} task`);
    }
    if (context.routerPreferredStrategyId === strategy.id) {
      score += 4;
      reasons.push("fits this learning problem");
    }
    if (strategy.subjects.includes(profile.id)) {
      score += 2;
      reasons.push(`fits ${profile.label}`);
    }
    if (strategy.technique && profile.preferredTechniques.includes(strategy.technique)) {
      score += 1.5;
      reasons.push("subject profile prefers this technique");
    }
    if (strategy.technique && profile.avoidTechniques.includes(strategy.technique)) {
      score -= 3;
      reasons.push("subject profile discourages this technique");
    }
    // Observed outcomes for THIS student outrank profile defaults, but never
    // become a permanent label — they are just the latest evidence.
    if (preferred.has(strategy.id) || (strategy.technique && preferred.has(strategy.technique))) {
      score += 4;
      reasons.push("this student rated this approach helpful");
    }
    if (avoid.has(strategy.id) || (strategy.technique && avoid.has(strategy.technique))) {
      score -= 5;
      reasons.push("this student asked for something other than this");
    }
    if (shown.has(strategy.id)) {
      score -= 6;
      reasons.push("already shown for this concept");
    }
    if (strategy.cost === "deterministic") {
      score += 0.75;
      reasons.push("no model call needed");
    }

    // Learned effectiveness. Only meaningful evidence (enough recent samples
    // AND a real effect size, in this same subject + task kind) moves the
    // score, so one lucky round cannot displace a cold-start default.
    const learned = evidenceAdjustment(context.evidence, {
      strategyId: strategy.id,
      subjectProfileId: context.subjectProfileId ?? null,
      taskKind: context.taskKind ?? null,
    });
    let evidenceRow: StrategyEvidence | null = null;
    if (learned.adjustment !== 0 && learned.evidence) {
      score += learned.adjustment;
      evidenceRow = learned.evidence;
      reasons.push(learned.adjustment > 0
        ? "this has actually worked for this student on this kind of task"
        : "this has not worked for this student on this kind of task");
    }

    choices.push({
      strategy,
      score,
      reasons,
      evidence: evidenceRow,
      note: evidenceNote(evidenceRow),
    });
  }

  // Tie-break on authored catalog order: entries are written in cold-start
  // preference order, so an untested student gets the safest default first.
  choices.sort((a, b) => (
    (b.score - a.score)
    || ((catalogRank.get(a.strategy.id) ?? 99) - (catalogRank.get(b.strategy.id) ?? 99))
  ));

  if (!choices.length) {
    const fallback = STRATEGY_BY_ID[FALLBACK_STRATEGY_ID];
    return [{ strategy: fallback, score: 0, reasons: ["fallback: nothing else was applicable"] }];
  }
  return choices;
}

/** Convenience: the single best strategy, never null. */
export function selectStrategy(context: StrategySelectionContext): StrategyChoice {
  return selectStrategies(context)[0];
}

export interface StudentAction {
  strategyId: string;
  label: string;
  modality: StrategyModality;
  cost: StrategyCost;
}

/**
 * Contextual student controls — at most `limit`, one per modality, only ever
 * strategies that actually apply right now. This is deliberately not a
 * permanent wall of buttons.
 */
export function contextualStudentActions(
  context: StrategySelectionContext,
  limit = 3,
): StudentAction[] {
  const actions: StudentAction[] = [];
  const seenModality = new Set<StrategyModality>();
  for (const { strategy } of selectStrategies({ ...context, requestedStrategyId: undefined })) {
    if (!strategy.actionLabel) continue;
    if (seenModality.has(strategy.modality)) continue;
    seenModality.add(strategy.modality);
    actions.push({
      strategyId: strategy.id,
      label: strategy.actionLabel,
      modality: strategy.modality,
      cost: strategy.cost,
    });
    if (actions.length >= limit) break;
  }
  return actions;
}

/** Guidance line injected into a grounded generation prompt. */
export function strategyPromptGuidance(strategyId: string | null | undefined): string | null {
  const strategy = strategyId ? STRATEGY_BY_ID[strategyId] : null;
  if (!strategy) return null;
  return [
    `Learning strategy to use: ${strategy.label} (${strategy.modality}).`,
    `Use it when: ${strategy.whenToUse}`,
    `Do not use it when: ${strategy.avoidWhen}`,
    `Accuracy constraint: ${strategy.safety}`,
  ].join(" ");
}

/** True when the strategy can be produced without any model call. */
export function isDeterministicStrategy(strategyId: string | null | undefined): boolean {
  const strategy = strategyId ? STRATEGY_BY_ID[strategyId] : null;
  return strategy?.cost === "deterministic";
}
