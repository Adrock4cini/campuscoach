/**
 * Coach recommender — the Dashboard's "if I were your tutor" engine.
 *
 * PURE, DETERMINISTIC, TESTABLE. Reads only the permanent memory
 * layer (mastery, exams, assignments, classes). Never reads from
 * `learning_artifacts` — artifacts are disposable views, not memory.
 *
 * See mem://constraints/concept-architecture. This module belongs to
 * the Prediction layer: it turns permanent memory into ranked next
 * actions with structured evidence.
 */

export type CoachActionKind = "study" | "review" | "capture" | "debrief";

export interface Evidence {
  type: "exam" | "assignment" | "mastery" | "review" | "capture" | "trend";
  label: string;
  /** 0..1 — how much this piece of evidence pushed the score up. */
  weight: number;
}

export interface CoachRecommendation {
  /** Stable per (classId, action) so React keys are safe. */
  id: string;
  action: CoachActionKind;
  classId: string;
  className: string;
  /** Concept ids the tutor would drill next. May be empty for capture actions. */
  conceptIds: string[];
  /** Suggested block length. Coach thinks in 10-min units. */
  minutes: number;
  /** One-sentence rationale for the UI. */
  why: string;
  /** Structured breakdown behind `why`. Preserved for future trust cards. */
  evidence: Evidence[];
  impact: {
    /** Estimated readiness gain in percentage points if the student succeeds ~70%. */
    readinessDelta: number;
    /** Weight of the driving exam (0..1); 0 if no exam soon. */
    examWeight: number;
  };
  /** Raw score used for ordering. Higher = more urgent/impactful. */
  score: number;
}

export interface CoachInputClass {
  id: string;      // client_class_id — the id the rest of the app uses
  name: string;
  currentReadiness?: number; // 0..100
}

export interface CoachInputMastery {
  concept_id: string;
  class_id: string; // client_class_id
  strength: number; // 0..1
  next_review_at: string | null;
  attempts: number;
}

export interface CoachInputExam {
  class_id: string;   // client_class_id
  exam_date: string | null;
  title: string;
  /** 0..1 grade weight if known. Default 1 (treat every exam as important). */
  weight?: number;
}

export interface CoachInputAssignment {
  class_id: string;
  due_date: string | null;
  title: string;
}

export interface CoachInputs {
  classes: CoachInputClass[];
  mastery: CoachInputMastery[];
  exams: CoachInputExam[];
  assignments: CoachInputAssignment[];
  now?: Date;
}

const EXAM_HORIZON_DAYS = 14;
const WEAK_THRESHOLD = 0.5;
const BLOCK_MINUTES = 10;
const CONCEPTS_PER_BLOCK = 6;

function daysBetween(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  const base = new Date(now); base.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - base.getTime()) / 86400000);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function recommend(inputs: CoachInputs): CoachRecommendation[] {
  const now = inputs.now ?? new Date();

  const masteryByClass = new Map<string, CoachInputMastery[]>();
  for (const m of inputs.mastery) {
    const arr = masteryByClass.get(m.class_id) ?? [];
    arr.push(m);
    masteryByClass.set(m.class_id, arr);
  }

  const nextExamByClass = new Map<string, { days: number; title: string; weight: number }>();
  for (const e of inputs.exams) {
    const d = daysBetween(e.exam_date, now);
    if (d === null || d < 0) continue;
    const cur = nextExamByClass.get(e.class_id);
    if (!cur || d < cur.days) {
      nextExamByClass.set(e.class_id, { days: d, title: e.title, weight: e.weight ?? 1 });
    }
  }

  const nextAssignByClass = new Map<string, { days: number; title: string }>();
  for (const a of inputs.assignments) {
    const d = daysBetween(a.due_date, now);
    if (d === null || d < 0) continue;
    const cur = nextAssignByClass.get(a.class_id);
    if (!cur || d < cur.days) {
      nextAssignByClass.set(a.class_id, { days: d, title: a.title });
    }
  }

  const recs: CoachRecommendation[] = [];
  for (const c of inputs.classes) {
    const mastery = masteryByClass.get(c.id) ?? [];
    const exam = nextExamByClass.get(c.id);
    const assign = nextAssignByClass.get(c.id);

    // No memory yet? The tutor's advice is: capture something.
    if (mastery.length === 0) {
      const evidence: Evidence[] = [
        { type: "capture", label: "No concepts captured yet", weight: 0.6 },
      ];
      if (exam) {
        evidence.unshift({
          type: "exam",
          label: `${exam.title} in ${exam.days}d`,
          weight: clamp(1 - exam.days / EXAM_HORIZON_DAYS, 0.1, 1),
        });
      }
      const examWeight = exam ? clamp(1 - exam.days / EXAM_HORIZON_DAYS, 0, 1) * (exam.weight ?? 1) : 0;
      const score = 0.3 + examWeight * 0.5;
      recs.push({
        id: `${c.id}:capture`,
        action: "capture",
        classId: c.id,
        className: c.name,
        conceptIds: [],
        minutes: BLOCK_MINUTES,
        why: exam
          ? `${exam.title} is in ${exam.days} days — add notes first.`
          : "Add a note or professor hint to build your first study set.",
        evidence,
        impact: { readinessDelta: 0, examWeight },
        score,
      });
      continue;
    }

    const weak = mastery
      .filter((m) => m.strength < WEAK_THRESHOLD)
      .sort((a, b) => a.strength - b.strength);
    const overdue = mastery.filter(
      (m) => m.next_review_at && new Date(m.next_review_at).getTime() <= now.getTime(),
    );

    const fragility = weak.length
      ? weak.reduce((s, m) => s + (1 - m.strength), 0) / weak.length
      : 0;
    const overdueRatio = mastery.length ? overdue.length / mastery.length : 0;
    const examUrgency = exam ? clamp(1 - exam.days / EXAM_HORIZON_DAYS, 0, 1) : 0;
    const examWeight = exam ? examUrgency * (exam.weight ?? 1) : 0;

    const score =
      examWeight * 0.5 +
      fragility * 0.3 +
      overdueRatio * 0.2 +
      // small tiebreaker so classes with any weak concepts still surface without an exam
      (weak.length > 0 ? 0.05 : 0);

    const action: CoachActionKind =
      overdue.length > 0 ? "review" : weak.length > 0 ? "study" : "study";

    // Pick the concepts the tutor would actually drill.
    const pool = overdue.length ? overdue : weak.length ? weak : mastery;
    const targetConcepts = pool
      .slice()
      .sort((a, b) => a.strength - b.strength)
      .slice(0, CONCEPTS_PER_BLOCK);

    // Impact estimate: assume ~70% correct → strength drift +0.075 per concept.
    // Readiness = avg(strength)*100. New avg only changes for the targeted subset.
    const currentAvg = mastery.reduce((s, m) => s + m.strength, 0) / mastery.length;
    const projected =
      mastery.reduce((sum, m) => {
        if (targetConcepts.find((t) => t.concept_id === m.concept_id)) {
          const drift = 0.15 * 0.7 - 0.1 * 0.3; // = 0.075
          return sum + clamp(m.strength + drift, 0, 1);
        }
        return sum + m.strength;
      }, 0) / mastery.length;
    const readinessDelta = Math.max(0, Math.round((projected - currentAvg) * 100));

    // Evidence array — structured, ordered by weight desc.
    const evidence: Evidence[] = [];
    if (exam) {
      evidence.push({
        type: "exam",
        label: `${exam.title} in ${exam.days}d`,
        weight: Number(examWeight.toFixed(2)),
      });
    }
    if (weak.length > 0) {
      evidence.push({
        type: "mastery",
        label: `${weak.length} weak concept${weak.length === 1 ? "" : "s"}`,
        weight: Number(fragility.toFixed(2)),
      });
    }
    if (overdue.length > 0) {
      evidence.push({
        type: "review",
        label: `${overdue.length} concept${overdue.length === 1 ? "" : "s"} overdue for review`,
        weight: Number(overdueRatio.toFixed(2)),
      });
    }
    if (assign) {
      evidence.push({
        type: "assignment",
        label: `${assign.title} due in ${assign.days}d`,
        weight: clamp(1 - assign.days / 7, 0, 1),
      });
    }
    if (evidence.length === 0) {
      // Guarantee: every recommendation has at least one evidence chip.
      const avg = mastery.reduce((s, m) => s + m.strength, 0) / mastery.length;
      evidence.push({
        type: "trend",
        label: `Class average strength ${Math.round(avg * 100)}%`,
        weight: Number(avg.toFixed(2)),
      });
    }
    evidence.sort((a, b) => b.weight - a.weight);

    const why = buildWhy({ action, exam, weakCount: weak.length, overdueCount: overdue.length, className: c.name });

    recs.push({
      id: `${c.id}:${action}`,
      action,
      classId: c.id,
      className: c.name,
      conceptIds: targetConcepts.map((t) => t.concept_id),
      minutes: BLOCK_MINUTES,
      why,
      evidence,
      impact: { readinessDelta, examWeight: Number(examWeight.toFixed(2)) },
      score: Number(score.toFixed(3)),
    });
  }

  return recs.sort((a, b) => b.score - a.score);
}

function buildWhy(args: {
  action: CoachActionKind;
  exam: { days: number; title: string } | undefined;
  weakCount: number;
  overdueCount: number;
  className: string;
}): string {
  let attention: string;
  if (args.action === "review" && args.overdueCount > 0) {
    attention = `${args.overdueCount} concept${args.overdueCount === 1 ? "" : "s"} need review`;
  } else if (args.weakCount > 0) {
    attention = `${args.weakCount} concept${args.weakCount === 1 ? "" : "s"} need practice`;
  } else {
    attention = `Keep ${args.className} sharp`;
  }
  return args.exam
    ? `${attention} · ${args.exam.title} in ${args.exam.days} days.`
    : `${attention}.`;
}
