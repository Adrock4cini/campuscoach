/**
 * Zero-form capture context inference.
 *
 * Capture only becomes a daily habit if the common case is CAMERA -> SAVE.
 * This module decides which class a capture belongs to *before* the student is
 * asked anything, using the smallest safe hierarchy:
 *
 * 1. Explicit entry context (opened from a class, assignment, or test).
 * 2. The class the student last captured into this session.
 * 3. A deterministic schedule match (student is inside exactly one class
 *    meeting window right now) — a suggestion, never silent truth.
 * 4. The student's only class, when they have exactly one.
 *
 * Anything ambiguous resolves to "ask" so Campus Coach never auto-assigns a
 * capture to the wrong class. A wrong class poisons concepts, mastery, and
 * every recommendation built on them.
 */

import {
  isDateWithinTerm,
  normalizeTimeKey,
  normalizeWeekdays,
  weekdayForDate,
} from "@/lib/calendar/classSchedule";
import { toDateKey } from "@/lib/calendar/dateKey";

export type CaptureClassSource =
  | "entry"
  | "remembered"
  | "schedule"
  | "only-class"
  | "none";

export interface CaptureClassCandidate {
  id: string;
  name?: string;
  days?: readonly string[];
  startTimeKey?: string;
  endTimeKey?: string;
  semesterStartDate?: string;
  semesterEndDate?: string;
}

export interface CaptureClassInference {
  /** Empty string when Campus Coach must ask. */
  classId: string;
  source: CaptureClassSource;
  /** "high" prefills silently, "medium" prefills with a visible suggestion. */
  confidence: "high" | "medium" | "none";
  /** True when the student still has to answer the one class question. */
  needsClass: boolean;
}

function minutesFromTimeKey(value: string | null | undefined): number | null {
  const key = normalizeTimeKey(value);
  if (!key) return null;
  const [hours, minutes] = key.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Classes whose known meeting window contains `now`. Returns every match so an
 * ambiguous overlap can be detected rather than silently resolved.
 */
export function classesMeetingNow(
  classes: readonly CaptureClassCandidate[],
  now: Date = new Date(),
): CaptureClassCandidate[] {
  const today = weekdayForDate(now);
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  return classes.filter((item) => {
    const days = normalizeWeekdays(item.days ?? []);
    if (!days.includes(today)) return false;

    const start = minutesFromTimeKey(item.startTimeKey);
    const end = minutesFromTimeKey(item.endTimeKey);
    // Without both edges the "student is in this class right now" claim is a
    // guess, not a deterministic match.
    if (start === null || end === null || end <= start) return false;
    if (minuteOfDay < start || minuteOfDay > end) return false;

    if (item.semesterStartDate || item.semesterEndDate) {
      if (!isDateWithinTerm(toDateKey(now), item.semesterStartDate, item.semesterEndDate)) return false;
    }
    return true;
  });
}

export function inferCaptureClass(input: {
  entryClassId?: string | null;
  rememberedClassId?: string | null;
  classes: readonly CaptureClassCandidate[];
  now?: Date;
}): CaptureClassInference {
  const { classes } = input;
  const has = (id: string | null | undefined): id is string =>
    !!id && classes.some((item) => item.id === id);

  if (has(input.entryClassId)) {
    return { classId: input.entryClassId, source: "entry", confidence: "high", needsClass: false };
  }
  if (has(input.rememberedClassId)) {
    return {
      classId: input.rememberedClassId,
      source: "remembered",
      confidence: "high",
      needsClass: false,
    };
  }

  const meetingNow = classesMeetingNow(classes, input.now ?? new Date());
  if (meetingNow.length === 1) {
    return {
      classId: meetingNow[0].id,
      source: "schedule",
      confidence: "medium",
      needsClass: false,
    };
  }

  if (classes.length === 1) {
    return { classId: classes[0].id, source: "only-class", confidence: "high", needsClass: false };
  }

  // Ambiguous evidence (no schedule, or two overlapping classes) always asks.
  return { classId: "", source: "none", confidence: "none", needsClass: true };
}

/** Student-facing label for the capture context chip, e.g. "Math · today". */
export function captureContextLabel(input: {
  className?: string | null;
  dateKey: string;
  todayKey: string;
  topic?: string | null;
}): string {
  const parts = [input.className?.trim() || "No class yet"];
  parts.push(input.dateKey === input.todayKey ? "today" : input.dateKey);
  const topic = input.topic?.trim();
  if (topic) parts.push(topic);
  return parts.join(" · ");
}
