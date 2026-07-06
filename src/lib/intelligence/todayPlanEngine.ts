/**
 * Today's Plan Engine.
 *
 * Turns everything Campus Brain knows about a student — upcoming
 * exams, assignments due soon, weak classes, recent captures, streak,
 * and Campus Brain signals — into 3–5 concrete "do this next"
 * actions the Dashboard can render without deciding anything itself.
 *
 * Every plan item is stamped with a `source` so surfaces can show a
 * short reason chip and so completing one item can intelligently
 * refresh the rest of the plan.
 */

import { classes, exams, assignments, getDaysUntil } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { getEffectiveReadiness } from "./readinessEngine";
import { computeMomentum } from "./campusBrain";
import { listCaptures } from "@/lib/capture/processor";
import type { CaptureResult } from "@/lib/capture/types";

export type TodayPlanSource =
  | "exam"
  | "assignment"
  | "capture"
  | "weak-concept"
  | "momentum";

export interface TodayPlanItem {
  id: string;
  classId: string;
  className: string;
  classColor: string;
  title: string;
  reasonChip: string;
  minutes: number;
  expectedReadinessGain: number;
  source: TodayPlanSource;
  primaryAction: {
    label: string;
    to: string;
  };
  /** For capture-sourced items so the caller can open Study From Capture. */
  captureId?: string;
  /** Raw priority score — higher wins. */
  score: number;
}

export interface TodayPlan {
  items: TodayPlanItem[];
  totalMinutes: number;
  totalReadinessGain: number;
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Completed-item overlay                                              */
/* ------------------------------------------------------------------ */

const DONE_KEY = "cc_today_plan_done_v1";

interface DoneOverlay {
  ids: string[];
  day: string; // YYYY-MM-DD — resets daily
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDone(): DoneOverlay {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) || "null");
    if (!raw || raw.day !== today()) return { ids: [], day: today() };
    return raw;
  } catch {
    return { ids: [], day: today() };
  }
}
function writeDone(v: DoneOverlay) {
  localStorage.setItem(DONE_KEY, JSON.stringify(v));
}

export function markTodayPlanItemDone(id: string) {
  const d = readDone();
  if (!d.ids.includes(id)) d.ids.push(id);
  writeDone(d);
}

export function isTodayPlanItemDone(id: string): boolean {
  return readDone().ids.includes(id);
}

/* ------------------------------------------------------------------ */
/* Candidate builders                                                  */
/* ------------------------------------------------------------------ */

function buildExamItems(): TodayPlanItem[] {
  const items: TodayPlanItem[] = [];
  exams.forEach((e) => {
    const days = getDaysUntil(e.date);
    if (days < 0 || days > 14) return;
    const cls = classes.find((c) => c.id === e.classId);
    if (!cls) return;
    const readiness = getEffectiveReadiness(cls.id, cls.readiness);
    const urgency = days <= 2 ? 120 : days <= 5 ? 90 : days <= 10 ? 55 : 30;
    const gap = Math.max(0, 90 - readiness);
    const minutes = days <= 2 ? 20 : days <= 7 ? 15 : 12;

    items.push({
      id: `exam:${e.id}`,
      classId: cls.id,
      className: cls.name,
      classColor: cls.color,
      title: `Prep for ${e.title}`,
      reasonChip: days <= 0 ? "Exam today" : `Exam in ${days}d`,
      minutes,
      expectedReadinessGain: Math.min(6, Math.round(gap / 15) + 2),
      source: "exam",
      primaryAction: {
        label: "Start prep",
        to: `/focus-sprint?classId=${cls.id}&duration=${minutes}`,
      },
      score: urgency + gap * 0.6,
    });
  });
  return items;
}

function buildAssignmentItems(): TodayPlanItem[] {
  const items: TodayPlanItem[] = [];
  assignments
    .filter((a) => a.status !== "turned-in")
    .forEach((a) => {
      const days = getDaysUntil(a.dueDate);
      if (days > 5) return;
      const cls = classes.find((c) => c.id === a.classId);
      if (!cls) return;
      const urgency =
        days <= 0 ? 140 : days <= 1 ? 110 : days <= 3 ? 70 : 40;
      const minutes = days <= 1 ? 20 : 15;
      items.push({
        id: `assignment:${a.id}`,
        classId: cls.id,
        className: cls.name,
        classColor: cls.color,
        title: a.title,
        reasonChip:
          days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days}d`,
        minutes,
        expectedReadinessGain: 3,
        source: "assignment",
        primaryAction: {
          label: days <= 0 ? "Finish now" : "Start",
          to: `/assignments/${a.id}`,
        },
        score: urgency + (a.priority === "high" ? 20 : a.priority === "medium" ? 8 : 0),
      });
    });
  return items;
}

function buildWeakConceptItems(): TodayPlanItem[] {
  // Two lowest-readiness classes that don't already have an exam item.
  const sorted = [...classes]
    .map((c) => ({ c, r: getEffectiveReadiness(c.id, c.readiness) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 2);
  return sorted
    .filter((x) => x.r < 75)
    .map(({ c, r }) => {
      const pulse = getClassPulse(c.id);
      const topic = pulse?.mostStruggled.topic ?? c.currentTopic;
      const minutes = r < 45 ? 15 : 10;
      return {
        id: `weak:${c.id}`,
        classId: c.id,
        className: c.name,
        classColor: c.color,
        title: `Practice ${topic}`,
        reasonChip: `${r}% ready`,
        minutes,
        expectedReadinessGain: r < 45 ? 5 : 3,
        source: "weak-concept" as const,
        primaryAction: {
          label: "Study",
          to: `/study-lab?classId=${c.id}`,
        },
        score: 60 + (75 - r),
      };
    });
}

function buildCaptureItems(): TodayPlanItem[] {
  const recent: CaptureResult[] = listCaptures()
    .filter((c) => {
      const ageH = (Date.now() - new Date(c.createdAt).getTime()) / 3.6e6;
      return ageH <= 48;
    })
    .slice(0, 3);
  return recent.map((cap) => {
    const cls = classes.find((c) => c.id === cap.context.classId);
    const topic = cap.context.topic || cap.keyConcepts[0] || "recent capture";
    return {
      id: `capture:${cap.id}`,
      classId: cap.context.classId,
      className: cls?.name ?? "Class",
      classColor: cls?.color ?? "bg-primary",
      title: `Study from ${topic}`,
      reasonChip: "Fresh capture",
      minutes: 8,
      expectedReadinessGain: 3,
      source: "capture" as const,
      primaryAction: {
        label: "Study",
        to: `/classes/${cap.context.classId}?capture=${cap.id}`,
      },
      captureId: cap.id,
      score: 50,
    };
  });
}

function buildMomentumItem(): TodayPlanItem | null {
  const m = computeMomentum();
  if (m.score >= 70) return null; // already rolling
  // Suggest a tiny burst on the top-priority class to keep the streak.
  const cls = [...classes]
    .map((c) => ({ c, r: getEffectiveReadiness(c.id, c.readiness) }))
    .sort((a, b) => a.r - b.r)[0]?.c;
  if (!cls) return null;
  return {
    id: `momentum:${today()}`,
    classId: cls.id,
    className: cls.name,
    classColor: cls.color,
    title: "5-minute recall warm-up",
    reasonChip: m.trend === "cooling" ? "Keep streak" : "Warm up",
    minutes: 5,
    expectedReadinessGain: 1,
    source: "momentum",
    primaryAction: {
      label: "Start 5m",
      to: `/focus-sprint?classId=${cls.id}&duration=5`,
    },
    score: 25,
  };
}

/* ------------------------------------------------------------------ */
/* Ranking + selection                                                 */
/* ------------------------------------------------------------------ */

/**
 * Simple ranker: honor raw urgency score, but boost items with high
 * readiness gain per minute so a short, high-yield task beats a long
 * one when the student is short on time.
 */
export function rankTodayPlanItems(items: TodayPlanItem[]): TodayPlanItem[] {
  return [...items].sort((a, b) => {
    const yieldA = a.expectedReadinessGain / Math.max(1, a.minutes);
    const yieldB = b.expectedReadinessGain / Math.max(1, b.minutes);
    return b.score + yieldB * 20 - (a.score + yieldA * 20);
  });
}

export function getEstimatedPlanTime(items: TodayPlanItem[]): number {
  return items.reduce((s, i) => s + i.minutes, 0);
}

export function getPlanCompletionImpact(items: TodayPlanItem[]): {
  readinessGain: number;
  minutes: number;
  itemCount: number;
} {
  return {
    readinessGain: items.reduce((s, i) => s + i.expectedReadinessGain, 0),
    minutes: getEstimatedPlanTime(items),
    itemCount: items.length,
  };
}

/**
 * Generate 3–5 items sized to the available time budget.
 * `availableMinutes` defaults to 45 — a comfortable ADHD-friendly cap.
 */
export function generateTodayPlan(availableMinutes = 45): TodayPlan {
  const done = new Set(readDone().ids);
  const candidates: TodayPlanItem[] = [
    ...buildExamItems(),
    ...buildAssignmentItems(),
    ...buildWeakConceptItems(),
    ...buildCaptureItems(),
  ];
  const momentum = buildMomentumItem();
  if (momentum) candidates.push(momentum);

  // Dedupe: at most one item per (classId, source) pair — we don't
  // want three "practice weak concept" cards for the same class.
  const seen = new Set<string>();
  const unique = candidates.filter((it) => {
    if (done.has(it.id)) return false;
    const key = `${it.classId}:${it.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = rankTodayPlanItems(unique);

  // Greedy pack up to 5 items within the time budget.
  const picked: TodayPlanItem[] = [];
  let used = 0;
  for (const it of ranked) {
    if (picked.length >= 5) break;
    if (used + it.minutes > availableMinutes && picked.length >= 3) continue;
    picked.push(it);
    used += it.minutes;
  }
  // Guarantee at least 3 when we have the candidates.
  if (picked.length < 3) {
    for (const it of ranked) {
      if (picked.includes(it)) continue;
      picked.push(it);
      if (picked.length >= 3) break;
    }
  }

  return {
    items: picked,
    totalMinutes: getEstimatedPlanTime(picked),
    totalReadinessGain: picked.reduce(
      (s, i) => s + i.expectedReadinessGain,
      0,
    ),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Mark an item done and return a freshly ranked plan. Called after
 * the student completes an action so the remaining plan updates
 * immediately without a page reload.
 */
export function refreshTodayPlanAfterAction(
  itemId: string,
  availableMinutes = 45,
): TodayPlan {
  markTodayPlanItemDone(itemId);
  try {
    window.dispatchEvent(new CustomEvent("today-plan:updated"));
  } catch {
    /* non-browser */
  }
  return generateTodayPlan(availableMinutes);
}
