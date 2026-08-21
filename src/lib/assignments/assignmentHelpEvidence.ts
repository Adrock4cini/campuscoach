/**
 * Assignment Help — the "two birds with one stone" bridge.
 *
 * A student uses Campus Coach to finish homework correctly AND Campus Coach
 * learns which concepts they actually encountered and struggled with, so later
 * test prep is better.
 *
 * Non-negotiable semantics (see mem://constraints/concept-architecture):
 *   - COMPLETION IS NOT MASTERY. Marking an assignment done, or being shown a
 *     worked answer, changes organisational status only.
 *   - Needing help is *learning evidence*, never failure shame: it records
 *     exposure + a weak signal so the concept stays prioritised.
 *   - Mastery only moves through the existing `applyMasteryUpdate` math, which
 *     the `record-study-result` edge function also uses. No parallel model.
 */

import {
  applyMasteryUpdate,
  type ConfidenceLevel,
  type MasteryRow,
} from "@/lib/mastery/updateMastery";

export type AssignmentHelpOutcome =
  /** Student asked for a hint / explanation before attempting. */
  | "needed_hint"
  /** Student attempted after help and got it right. */
  | "solved_after_help"
  /** Student solved it without help. */
  | "solved_unaided"
  /** Student attempted after help and still got it wrong. */
  | "missed_after_help"
  /** AI produced a worked answer; the student never demonstrated understanding. */
  | "answer_shown_only"
  /** Organisational status change on the assignment row. */
  | "marked_complete";

export interface AssignmentHelpEvent {
  conceptId: string;
  outcome: AssignmentHelpOutcome;
  /** Optional self-rating captured before feedback. */
  confidence?: ConfidenceLevel | null;
  /** Stable per interaction, so a replayed request cannot double-count. */
  eventId: string;
  now?: Date;
}

export interface AssignmentHelpEvidence {
  conceptId: string;
  /** Whether this event is allowed to move `user_concept_mastery`. */
  recordsMastery: boolean;
  /** Present only when `recordsMastery` is true. */
  masteryUpdate: MasteryRow | null;
  /** Always true for a real interaction — the concept was encountered. */
  recordsExposure: boolean;
  /** Student-safe, shame-free explanation of what was learned. */
  studentNote: string;
  /** Why the loop treated the event this way (QA + UI disclosure). */
  reason: string;
}

const SHAME_FREE_NOTE: Record<AssignmentHelpOutcome, string> = {
  needed_hint: "You needed a hint here — Campus Coach will bring this back before your test.",
  solved_after_help: "You worked it out after a hint. That counts.",
  solved_unaided: "You solved this one on your own.",
  missed_after_help: "Still tricky — this stays near the top of your practice list.",
  answer_shown_only: "You saw a worked answer. Practice it once and it will count.",
  marked_complete: "Assignment marked done. Your practice record is unchanged.",
};

/** Outcomes that are pure organisation or pure exposure. */
const NO_MASTERY: ReadonlySet<AssignmentHelpOutcome> = new Set([
  "marked_complete",
  "answer_shown_only",
]);

export function assignmentHelpEvidence(
  event: AssignmentHelpEvent,
  previous: MasteryRow | null,
): AssignmentHelpEvidence {
  const base = {
    conceptId: event.conceptId,
    recordsExposure: event.outcome !== "marked_complete",
    studentNote: SHAME_FREE_NOTE[event.outcome],
  };

  if (NO_MASTERY.has(event.outcome)) {
    return {
      ...base,
      recordsMastery: false,
      masteryUpdate: null,
      reason: event.outcome === "marked_complete"
        ? "Completion is an organisational status, not evidence of understanding."
        : "An AI-produced answer is not a retrieval attempt by the student.",
    };
  }

  // Needing a hint is a real, recorded retrieval failure — weak, not shameful.
  const correct = event.outcome === "solved_after_help" || event.outcome === "solved_unaided";
  const confidence: ConfidenceLevel | null = event.confidence
    ?? (event.outcome === "needed_hint" ? "low" : event.outcome === "solved_unaided" ? "medium" : "low");

  return {
    ...base,
    recordsMastery: true,
    masteryUpdate: applyMasteryUpdate({
      prev: previous,
      correct,
      confidence,
      now: event.now,
    }),
    reason: correct
      ? "The student produced the answer, so retrieval succeeded."
      : "The student could not retrieve it yet; this schedules it sooner.",
  };
}

/**
 * Applies a batch while ignoring replays of the same `eventId`. A dropped
 * response retried from the phone must never double-count evidence.
 */
export function applyAssignmentHelpEvents(
  events: readonly AssignmentHelpEvent[],
  initial: Record<string, MasteryRow | null> = {},
  alreadyApplied: readonly string[] = [],
): {
  mastery: Record<string, MasteryRow | null>;
  applied: AssignmentHelpEvidence[];
  skippedEventIds: string[];
} {
  const seen = new Set(alreadyApplied);
  const mastery: Record<string, MasteryRow | null> = { ...initial };
  const applied: AssignmentHelpEvidence[] = [];
  const skippedEventIds: string[] = [];

  for (const event of events) {
    if (seen.has(event.eventId)) {
      skippedEventIds.push(event.eventId);
      continue;
    }
    seen.add(event.eventId);
    const evidence = assignmentHelpEvidence(event, mastery[event.conceptId] ?? null);
    if (evidence.recordsMastery && evidence.masteryUpdate) {
      mastery[event.conceptId] = evidence.masteryUpdate;
    }
    applied.push(evidence);
  }

  return { mastery, applied, skippedEventIds };
}
