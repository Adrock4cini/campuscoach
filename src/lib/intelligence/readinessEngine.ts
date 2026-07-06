/**
 * Readiness Engine — turns completed study into concrete moves on
 * Momentum, per-class Readiness, the Student Model, and the Campus
 * Brain signal log.
 *
 * We can't mutate the demo data arrays, so every effect of study is
 * stored as an OVERLAY in localStorage keyed by classId. Consumers
 * read `getEffectiveReadiness(classId, base)` and
 * `getMomentumBoost()` to see the up-to-the-minute picture.
 *
 * Every completion also writes to Supabase (`study_sessions` +
 * `campus_brain_signals`) via the persistence layer — non-blocking,
 * so the demo keeps working offline.
 */

import { classes } from "@/data/demo";
import { estimateExamGrade, getClassPriorities } from "./engine";
import { supabase } from "@/integrations/supabase/client";
import { getAnonUserId } from "@/hooks/useClassIntelligence";
import { saveCampusBrainSignal } from "@/lib/supabase/capturePersistence";
import type { StudyMode } from "@/lib/study/studyFromCapture";

/* ------------------------------------------------------------------ */
/* Overlay store                                                       */
/* ------------------------------------------------------------------ */

const READINESS_KEY = "cc_readiness_overlay_v1";
const MOMENTUM_KEY = "cc_momentum_overlay_v1";

interface ReadinessOverlay {
  byClass: Record<string, number>; // additive delta over base readiness
  lastUpdated: string;
}

interface MomentumOverlay {
  boost: number;         // additive to computed momentum, decays daily
  bumps: { at: string; amount: number }[]; // last few bumps for display
}

function readReadiness(): ReadinessOverlay {
  try {
    return JSON.parse(
      localStorage.getItem(READINESS_KEY) ||
        '{"byClass":{},"lastUpdated":""}',
    );
  } catch {
    return { byClass: {}, lastUpdated: "" };
  }
}
function writeReadiness(v: ReadinessOverlay) {
  localStorage.setItem(READINESS_KEY, JSON.stringify(v));
}

function readMomentum(): MomentumOverlay {
  try {
    return JSON.parse(
      localStorage.getItem(MOMENTUM_KEY) || '{"boost":0,"bumps":[]}',
    );
  } catch {
    return { boost: 0, bumps: [] };
  }
}
function writeMomentum(v: MomentumOverlay) {
  localStorage.setItem(MOMENTUM_KEY, JSON.stringify(v));
}

/* ------------------------------------------------------------------ */
/* Public reads                                                        */
/* ------------------------------------------------------------------ */

export function getReadinessDelta(classId: string): number {
  return readReadiness().byClass[classId] ?? 0;
}

export function getEffectiveReadiness(classId: string, base?: number): number {
  const b = base ?? classes.find((c) => c.id === classId)?.readiness ?? 0;
  return Math.max(0, Math.min(100, Math.round(b + getReadinessDelta(classId))));
}

export function getMomentumBoost(): number {
  const m = readMomentum();
  // decay: keep at most 24h worth of boost.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const fresh = m.bumps.filter((b) => new Date(b.at).getTime() >= cutoff);
  const boost = fresh.reduce((s, b) => s + b.amount, 0);
  return Math.max(0, Math.min(40, Math.round(boost)));
}

export function getRecentMomentumBumps(): MomentumOverlay["bumps"] {
  return readMomentum().bumps.slice(-5).reverse();
}

export function getGradeEstimate(classId: string): string {
  return estimateExamGrade(getEffectiveReadiness(classId));
}

export function getNextBestActionForClass(classId: string) {
  return getClassPriorities().find((p) => p.classId === classId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Change estimation                                                   */
/* ------------------------------------------------------------------ */

export interface StudyOutcome {
  classId: string;
  mode: StudyMode | string;
  topic: string;
  durationMinutes: number;
  /** 0-100 quiz/practice accuracy, if measurable */
  accuracy?: number;
  /** whether the topic was previously flagged as weak/struggled */
  targetedWeakConcept?: boolean;
  /** whether the student finished the session (false = bailed early) */
  completed?: boolean;
  captureId?: string;
}

export interface ReadinessChange {
  readinessDelta: number;
  momentumDelta: number;
  baseReadiness: number;
  newReadiness: number;
  gradeBefore: string;
  gradeAfter: string;
  className: string;
  reason: string;
}

/**
 * Simple, transparent scoring:
 *   +2  for completing any session
 *   +2  if it targeted a weak concept
 *   +2  if accuracy >= 80, +1 if accuracy >= 60
 *   +1  per 15 minutes of focused time (cap +3)
 *   ×0.4 if not completed
 * Diminishing returns near 100.
 */
export function estimateReadinessChange(o: StudyOutcome): number {
  let d = 2;
  if (o.targetedWeakConcept) d += 2;
  if (typeof o.accuracy === "number") {
    if (o.accuracy >= 80) d += 2;
    else if (o.accuracy >= 60) d += 1;
  }
  d += Math.min(3, Math.floor(o.durationMinutes / 15));
  if (o.completed === false) d = Math.round(d * 0.4);
  return d;
}

function estimateMomentumChange(o: StudyOutcome): number {
  let d = 8; // showing up is worth a lot
  if (typeof o.accuracy === "number" && o.accuracy >= 70) d += 3;
  if (o.durationMinutes >= 15) d += 2;
  if (o.completed === false) d = Math.round(d * 0.5);
  return d;
}

/* ------------------------------------------------------------------ */
/* Apply                                                               */
/* ------------------------------------------------------------------ */

/**
 * Persist the effect of one completed study session:
 *   1. Update the local readiness + momentum overlay
 *   2. Insert a `study_sessions` row (best-effort)
 *   3. Log a `campus_brain_signals` row so the Student Model can
 *      rebuild from history
 *   4. Broadcast `intelligence:updated` so pages can refresh
 */
export async function updateReadinessAfterStudy(
  outcome: StudyOutcome,
): Promise<ReadinessChange> {
  const cls = classes.find((c) => c.id === outcome.classId);
  const base = cls?.readiness ?? 0;
  const before = getEffectiveReadiness(outcome.classId, base);

  const readinessDelta = estimateReadinessChange(outcome);
  const momentumDelta = estimateMomentumChange(outcome);

  // 1. Overlay
  const r = readReadiness();
  const raw = (r.byClass[outcome.classId] ?? 0) + readinessDelta;
  // Clamp so effective stays in 0..100
  const cappedDelta = Math.max(-base, Math.min(100 - base, raw));
  r.byClass[outcome.classId] = cappedDelta;
  r.lastUpdated = new Date().toISOString();
  writeReadiness(r);

  const m = readMomentum();
  m.bumps.push({ at: new Date().toISOString(), amount: momentumDelta });
  // keep last 20
  m.bumps = m.bumps.slice(-20);
  m.boost = getMomentumBoost(); // recompute for storage clarity
  writeMomentum(m);

  const after = getEffectiveReadiness(outcome.classId, base);

  // 2 + 3. Best-effort Supabase writes — never throw.
  const userId = getAnonUserId();
  void (async () => {
    try {
      await supabase.from("study_sessions").insert({
        user_id: userId,
        client_class_id: outcome.classId,
        session_type: String(outcome.mode),
        topic: outcome.topic,
        duration_minutes: outcome.durationMinutes,
        accuracy: outcome.accuracy ?? null,
        completed: outcome.completed ?? true,
        source_capture_id: outcome.captureId ?? null,
        meta: {
          readinessDelta,
          momentumDelta,
        } as never,
      } as never);
    } catch {
      /* offline / column mismatch — overlay is source of truth */
    }
  })();

  void saveCampusBrainSignal({
    clientClassId: outcome.classId,
    sourceType: `study-complete:${outcome.mode}`,
    sourceId: outcome.captureId ?? null,
    topic: outcome.topic,
    weight: readinessDelta,
    payload: {
      accuracy: outcome.accuracy,
      durationMinutes: outcome.durationMinutes,
      completed: outcome.completed ?? true,
      readinessDelta,
      momentumDelta,
    },
  });

  // 4. Broadcast — let dashboard/class cards refresh their picks.
  try {
    window.dispatchEvent(
      new CustomEvent("intelligence:updated", {
        detail: { classId: outcome.classId, readinessDelta, momentumDelta },
      }),
    );
  } catch {
    /* non-browser */
  }

  return {
    readinessDelta: after - before,
    momentumDelta,
    baseReadiness: before,
    newReadiness: after,
    gradeBefore: estimateExamGrade(before),
    gradeAfter: estimateExamGrade(after),
    className: cls?.name ?? outcome.topic,
    reason: outcome.targetedWeakConcept
      ? "You hit a weak concept — that's the highest-value study."
      : outcome.accuracy && outcome.accuracy >= 80
        ? "Strong accuracy locked this in."
        : "Consistency compounds — this counts.",
  };
}
