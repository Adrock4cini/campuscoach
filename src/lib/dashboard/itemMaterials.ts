/**
 * Honest "does Campus Coach have material for this?" semantics.
 *
 * "Captured for this assignment/test" means an explicit link on the capture
 * row (assignment_id / exam_id). A capture that merely belongs to the same
 * class is NOT counted here — class material is a separate, weaker signal.
 *
 * "Started studying" requires real study-session evidence. Completion of an
 * assignment is never mastery, and readiness never becomes a number without
 * evidence behind it.
 */
import { labelTestReadiness } from "@/lib/intelligence/testReadinessLabel";

export type MaterialTone = "calm" | "muted" | "warning";

export interface MaterialSignal {
  text: string;
  tone: MaterialTone;
  /** True when nothing is linked, so the UI can offer Add / Scan. */
  needsMaterial: boolean;
}

/** Material linked directly to one assignment or test. */
export function materialSignal(linkedCount: number, classCount = 0): MaterialSignal {
  if (linkedCount > 0) {
    return {
      text: linkedCount === 1 ? "1 material" : `${linkedCount} materials`,
      tone: "calm",
      needsMaterial: false,
    };
  }
  if (classCount > 0) {
    return { text: "Class material only", tone: "muted", needsMaterial: true };
  }
  return { text: "No material yet", tone: "warning", needsMaterial: true };
}

export const ASSIGNMENT_STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Completed",
} as const;

export type AssignmentStatusKey = keyof typeof ASSIGNMENT_STATUS_LABEL;

export function assignmentStatusLabel(status: string): string {
  return ASSIGNMENT_STATUS_LABEL[status as AssignmentStatusKey] ?? "Not started";
}

export interface TestPrepSignal {
  text: string;
  /** Truthful call to action for this test's current state. */
  cta: "Add material" | "Prepare" | "Continue studying";
  tone: MaterialTone;
}

/**
 * A test's preparation state, in words.
 *
 * No material linked and no class material → ask for material, never a score.
 * Material but no study session → "Not studied yet" + Prepare.
 * Study sessions exist → the readiness word, which is already evidence-backed.
 */
export function testPrepSignal(input: {
  linkedCount: number;
  classCount?: number;
  studySessions: number;
  readiness: number;
}): TestPrepSignal {
  const classCount = input.classCount ?? 0;
  if (input.linkedCount === 0 && classCount === 0) {
    return { text: "Need more material", cta: "Add material", tone: "warning" };
  }
  if (input.studySessions === 0) {
    return { text: "Not studied yet", cta: "Prepare", tone: "muted" };
  }
  return { text: labelTestReadiness(input.readiness).label, cta: "Continue studying", tone: "calm" };
}
