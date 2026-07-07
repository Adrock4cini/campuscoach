/**
 * Campus Coach — Learning Engine.
 *
 * Internal decision layer that answers five questions for every
 * student, per class, and overall:
 *
 *   1. What is the student's current objective?
 *   2. What evidence do we have that they understand each concept?
 *   3. What is the single highest-impact next activity?
 *   4. Why is that recommendation being made? (evidence — internal)
 *   5. How will we verify mastery after the activity?
 *
 * This module intentionally does NOT render anything. It merges every
 * available signal — captures, assignments, exams, study sessions,
 * readiness, momentum, aggregate class signals, professor emphasis —
 * into a single `LearningState` and emits typed `LearningRecommendation`
 * objects. Every future screen should read from here so recommendation
 * logic lives in one place.
 *
 * Signals are demo-backed today; swap the readers below for Supabase
 * queries later without changing consumers.
 */

import {
  classes,
  exams,
  assignments,
  studySessions,
  studentProfile,
  studyStreak,
  getDaysUntil,
  type Assignment,
  type ClassInfo,
  type Exam,
  type StudySession,
} from "@/data/demo";
import {
  classProfessorMap,
  getClassPulse,
  getPredictedTopics,
  getRecommendedTopic,
} from "@/data/courseIntelligence";

type ClassPulse = NonNullable<ReturnType<typeof getClassPulse>>;
type PredictedTopic = ReturnType<typeof getPredictedTopics>[number];
import { computeMomentum } from "./campusBrain";
import {
  estimateExamGrade,
  getClassPriorities,
  getTopFocusClass,
} from "./engine";
import type { Momentum } from "./types";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type EvidenceSource =
  | "capture"
  | "assignment"
  | "exam"
  | "study-session"
  | "readiness"
  | "momentum"
  | "class-signal"
  | "professor-emphasis"
  | "peer-signal"
  | "syllabus";

export interface Evidence {
  source: EvidenceSource;
  /** Short human-readable justification (internal). */
  note: string;
  /** 0-1 strength of this piece of evidence. */
  strength: number;
  /** Optional pointer to the underlying record (id, topic, etc). */
  ref?: string;
}

export type MasteryBand = "unknown" | "shaky" | "developing" | "solid" | "mastered";

/**
 * Per-concept understanding — evidence-backed, class-scoped.
 */
export interface ConceptUnderstanding {
  classId: string;
  topic: string;
  /** 0-100 estimated mastery. */
  mastery: number;
  band: MasteryBand;
  /** 0-1 how confident the engine is in the mastery number. */
  confidence: number;
  /** Probability this topic appears on the next exam (0-100). */
  examLikelihood: number;
  /** Days since the student last touched this concept, if known. */
  lastTouchedDays: number | null;
  evidence: Evidence[];
}

export type ObjectiveKind =
  | "pass-imminent-exam"
  | "submit-assignment"
  | "raise-class-readiness"
  | "maintain-momentum"
  | "recover-fading-concept";

/**
 * The single "what are we trying to accomplish right now?" answer,
 * either per-class or globally.
 */
export interface LearningObjective {
  kind: ObjectiveKind;
  classId: string;
  /** One-line description of the goal — internal, not user copy. */
  description: string;
  /** ISO date or null if open-ended. */
  deadline: string | null;
  /** 0-100 importance for the student's outcome. */
  weight: number;
}

export type ActivityKind =
  | "flashcards"
  | "multiple-choice"
  | "timed-challenge"
  | "focus-sprint"
  | "review-notes"
  | "review-capture"
  | "start-assignment"
  | "finish-assignment"
  | "exam-simulation"
  | "concept-refresh";

export type VerificationKind =
  | "quiz-accuracy"
  | "recall-check"
  | "assignment-submitted"
  | "self-rating"
  | "timed-score"
  | "post-session-confidence";

export interface VerificationPlan {
  kind: VerificationKind;
  /** Minimum score/threshold to consider the activity successful. */
  threshold: number;
  /** Internal description of how we'll re-check mastery. */
  note: string;
}

/**
 * A single recommendation the engine emits. Consumers pick the top
 * one (or the top-N per class) and render it however they want.
 */
export interface LearningRecommendation {
  id: string;
  classId: string;
  objective: LearningObjective;
  activity: ActivityKind;
  /** Short internal label; UI can still rewrite this for its own voice. */
  label: string;
  /** One-line rationale (internal — safe to show, but not required). */
  rationale: string;
  /** Suggested route the UI can navigate to. */
  route: string;
  /** 0-1 confidence in this being the right next step. */
  confidence: number;
  /** Estimated readiness/mastery gain in points (0-100 scale). */
  estimatedLearningGain: number;
  /** Estimated minutes to complete. */
  estimatedMinutes: number;
  /** Evidence that produced this recommendation (internal). */
  evidence: Evidence[];
  /** How we'll re-check mastery after completion. */
  verification: VerificationPlan;
}

/**
 * The full model every screen should read from. Combines captures,
 * assignments, exams, study sessions, readiness, momentum, aggregate
 * class signals, and professor emphasis into one place.
 */
export interface LearningState {
  studentId: string;
  computedAt: string;
  momentum: Momentum;
  /** Global objective — highest-weight objective across all classes. */
  primaryObjective: LearningObjective;
  /** Per-class snapshots. */
  classes: ClassLearningSnapshot[];
  /** Recommendations sorted by (confidence * learning gain) desc. */
  recommendations: LearningRecommendation[];
}

export interface ClassLearningSnapshot {
  classId: string;
  className: string;
  readiness: number;
  estimatedGrade: string;
  momentumContribution: number;
  nextExam: { id: string; title: string; date: string; daysUntil: number } | null;
  nextAssignment: {
    id: string;
    title: string;
    dueDate: string;
    daysUntil: number;
  } | null;
  objective: LearningObjective;
  concepts: ConceptUnderstanding[];
  professorEmphasis: string[];
  peerSignalLine: string | null;
  recommendation: LearningRecommendation;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const daysAgo = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

const bandFor = (mastery: number): MasteryBand => {
  if (mastery >= 90) return "mastered";
  if (mastery >= 75) return "solid";
  if (mastery >= 55) return "developing";
  if (mastery >= 30) return "shaky";
  return "unknown";
};

const nextExamFor = (classId: string): Exam | undefined =>
  exams
    .filter((e) => e.classId === classId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

const nextAssignmentFor = (classId: string): Assignment | undefined =>
  assignments
    .filter((a) => a.classId === classId && a.status !== "turned-in")
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )[0];

const sessionsFor = (classId: string): StudySession[] =>
  studySessions.filter((s) => s.classId === classId);

/* ------------------------------------------------------------------ */
/* Concept understanding                                              */
/* ------------------------------------------------------------------ */

function buildConceptUnderstanding(
  c: ClassInfo,
  pulse: ClassPulse | undefined,
  predicted: PredictedTopic[]
): ConceptUnderstanding[] {
  const strong = new Set(
    (nextExamFor(c.id)?.strongAreas ?? []).map((t) => t.toLowerCase())
  );
  const weak = new Set(
    (nextExamFor(c.id)?.weakAreas ?? []).map((t) => t.toLowerCase())
  );

  // Union of every topic we know about for this class.
  const topics = new Set<string>();
  predicted.forEach((t) => topics.add(t.topic));
  (nextExamFor(c.id)?.topics ?? []).forEach((t) => topics.add(t));
  if (pulse?.mostStruggled?.topic) topics.add(pulse.mostStruggled.topic);
  if (c.currentTopic) topics.add(c.currentTopic);

  return Array.from(topics).map((topic) => {
    const key = topic.toLowerCase();
    const prediction = predicted.find(
      (p) => p.topic.toLowerCase() === key
    );
    const evidence: Evidence[] = [];

    // Baseline: class readiness sets the floor.
    let mastery = c.readiness;
    evidence.push({
      source: "readiness",
      note: `Class readiness ${c.readiness}`,
      strength: 0.5,
      ref: c.id,
    });

    if (strong.has(key)) {
      mastery = Math.min(100, mastery + 15);
      evidence.push({
        source: "exam",
        note: "Listed as a strong area on next exam",
        strength: 0.6,
        ref: topic,
      });
    }
    if (weak.has(key)) {
      mastery = Math.max(0, mastery - 20);
      evidence.push({
        source: "exam",
        note: "Listed as a weak area on next exam",
        strength: 0.8,
        ref: topic,
      });
    }
    if (pulse?.mostStruggled?.topic?.toLowerCase() === key) {
      mastery = Math.max(0, mastery - 8);
      evidence.push({
        source: "peer-signal",
        note: `Peers most struggle here (${pulse.mostStruggled.percent ?? "?"}%)`,
        strength: 0.5,
        ref: topic,
      });
    }
    if (prediction) {
      evidence.push({
        source: "class-signal",
        note: `Predicted topic ${prediction.probability}% (${prediction.confidence})`,
        strength: prediction.probability / 100,
        ref: topic,
      });
    }

    const examLikelihood = prediction?.probability ?? (weak.has(key) ? 60 : 35);
    // Confidence rises with amount of evidence.
    const confidence = Math.min(1, 0.35 + evidence.length * 0.12);

    // Last touched — best effort from study sessions (topic isn't tracked
    // per-session in demo data yet, so we fall back to most recent session).
    const lastSession = sessionsFor(c.id).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
    const lastTouchedDays = lastSession ? daysAgo(lastSession.date) : null;

    return {
      classId: c.id,
      topic,
      mastery: Math.round(mastery),
      band: bandFor(mastery),
      confidence: Number(confidence.toFixed(2)),
      examLikelihood,
      lastTouchedDays,
      evidence,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Objectives                                                         */
/* ------------------------------------------------------------------ */

function buildClassObjective(c: ClassInfo): LearningObjective {
  const exam = nextExamFor(c.id);
  const assign = nextAssignmentFor(c.id);
  const examDays = exam ? getDaysUntil(exam.date) : Infinity;
  const assignDays = assign ? getDaysUntil(assign.dueDate) : Infinity;

  if (assign && assignDays <= 1) {
    return {
      kind: "submit-assignment",
      classId: c.id,
      description: `Submit ${assign.title}`,
      deadline: assign.dueDate,
      weight: 90,
    };
  }
  if (exam && examDays <= 10) {
    return {
      kind: "pass-imminent-exam",
      classId: c.id,
      description: `Be ready for ${exam.title}`,
      deadline: exam.date,
      weight: 85 + Math.max(0, 10 - examDays),
    };
  }
  if (c.readiness < 55) {
    return {
      kind: "raise-class-readiness",
      classId: c.id,
      description: `Raise ${c.name} readiness above 70%`,
      deadline: null,
      weight: 60 + (60 - c.readiness),
    };
  }
  return {
    kind: "maintain-momentum",
    classId: c.id,
    description: `Maintain momentum in ${c.name}`,
    deadline: null,
    weight: 30,
  };
}

/* ------------------------------------------------------------------ */
/* Recommendation builder                                             */
/* ------------------------------------------------------------------ */

function buildRecommendation(
  c: ClassInfo,
  objective: LearningObjective,
  concepts: ConceptUnderstanding[],
  pulse: ClassPulse | undefined
): LearningRecommendation {
  const exam = nextExamFor(c.id);
  const assign = nextAssignmentFor(c.id);
  const evidence: Evidence[] = [];
  const professorId = classProfessorMap[c.id];

  // Highest-priority weak concept.
  const target = [...concepts].sort((a, b) => {
    const aScore = (100 - a.mastery) * (a.examLikelihood / 100);
    const bScore = (100 - b.mastery) * (b.examLikelihood / 100);
    return bScore - aScore;
  })[0];

  if (target) {
    evidence.push({
      source: "class-signal",
      note: `Weakest high-likelihood concept: ${target.topic} (${target.mastery}% mastery, ${target.examLikelihood}% likely)`,
      strength: 0.8,
      ref: target.topic,
    });
  }
  if (professorId) {
    evidence.push({
      source: "professor-emphasis",
      note: `Professor ${professorId} emphasis considered`,
      strength: 0.4,
      ref: professorId,
    });
  }
  if (pulse?.networkEffectLine) {
    evidence.push({
      source: "peer-signal",
      note: pulse.networkEffectLine,
      strength: 0.5,
    });
  }

  let activity: ActivityKind;
  let label: string;
  let route: string;
  let minutes: number;
  let gain: number;
  let verification: VerificationPlan;

  if (objective.kind === "submit-assignment" && assign) {
    activity = assign.status === "not-started" ? "start-assignment" : "finish-assignment";
    label = activity === "start-assignment" ? "Start assignment" : "Finish assignment";
    route = `/assignments/${assign.id}`;
    minutes = 30;
    gain = 4;
    evidence.push({
      source: "assignment",
      note: `${assign.title} due in ${getDaysUntil(assign.dueDate)}d`,
      strength: 0.9,
      ref: assign.id,
    });
    verification = {
      kind: "assignment-submitted",
      threshold: 1,
      note: "Verify by submission status change to turned-in",
    };
  } else if (objective.kind === "pass-imminent-exam" && exam) {
    const days = getDaysUntil(exam.date);
    activity = days <= 3 ? "exam-simulation" : "focus-sprint";
    label = days <= 3 ? "Simulate exam" : "Focus sprint on weakest topic";
    route = `/focus-sprint?classId=${c.id}&duration=${days <= 3 ? 45 : 25}`;
    minutes = days <= 3 ? 45 : 25;
    gain = Math.min(12, Math.round((100 - c.readiness) * 0.15) + 4);
    evidence.push({
      source: "exam",
      note: `${exam.title} in ${days}d, readiness ${c.readiness}%`,
      strength: 0.9,
      ref: exam.id,
    });
    verification = {
      kind: "quiz-accuracy",
      threshold: 75,
      note: `Post-session mixed-topic quiz on ${target?.topic ?? exam.title}; ≥75% marks mastery`,
    };
  } else if (
    objective.kind === "raise-class-readiness" &&
    target &&
    target.mastery < 60
  ) {
    activity = target.mastery < 40 ? "flashcards" : "multiple-choice";
    label = activity === "flashcards" ? "Build recall" : "Practice under pressure";
    route = `/study-lab?classId=${c.id}`;
    minutes = studentProfile.defaultStudyLength ?? 20;
    gain = Math.round((60 - target.mastery) * 0.2) + 3;
    verification = {
      kind: "quiz-accuracy",
      threshold: 70,
      note: `Re-quiz ${target.topic} at end of session; ≥70% moves band up`,
    };
  } else if (objective.kind === "recover-fading-concept" && target) {
    activity = "concept-refresh";
    label = `Refresh ${target.topic}`;
    route = `/study-lab?classId=${c.id}`;
    minutes = 15;
    gain = 5;
    verification = {
      kind: "recall-check",
      threshold: 3,
      note: "Free-recall 3 key ideas; verify via self-check + next-day retention quiz",
    };
  } else {
    activity = "review-notes";
    label = "Skim class memory";
    route = `/classes/${c.id}`;
    minutes = 10;
    gain = 2;
    verification = {
      kind: "post-session-confidence",
      threshold: 4,
      note: "Ask 1-5 confidence after review; must stay ≥4",
    };
  }

  // Confidence = evidence density × objective weight.
  const evidenceStrength =
    evidence.reduce((s, e) => s + e.strength, 0) / Math.max(1, evidence.length);
  const confidence = Number(
    Math.min(1, evidenceStrength * 0.6 + (objective.weight / 100) * 0.4).toFixed(2)
  );

  return {
    id: `rec-${c.id}-${objective.kind}`,
    classId: c.id,
    objective,
    activity,
    label,
    rationale: target
      ? `${target.topic} is ${target.mastery}% mastered and ${target.examLikelihood}% likely on the next exam`
      : objective.description,
    route,
    confidence,
    estimatedLearningGain: gain,
    estimatedMinutes: minutes,
    evidence,
    verification,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build the full LearningState. Pure — safe to call from hooks.
 */
export function buildLearningState(): LearningState {
  const momentum = computeMomentum();
  const priorities = getClassPriorities();

  const classSnapshots: ClassLearningSnapshot[] = priorities.map((p) => {
    const c = classes.find((x) => x.id === p.classId)!;
    const pulse = getClassPulse(c.id);
    const predicted = getPredictedTopics(c.id);
    const concepts = buildConceptUnderstanding(c, pulse, predicted);
    const objective = buildClassObjective(c);
    const recommendation = buildRecommendation(c, objective, concepts, pulse);
    const exam = nextExamFor(c.id);
    const assign = nextAssignmentFor(c.id);
    const professorEmphasis = predicted
      .filter((t) => t.flags?.some((f) => /prof/i.test(f)))
      .map((t) => t.topic);

    return {
      classId: c.id,
      className: c.name,
      readiness: c.readiness,
      estimatedGrade: estimateExamGrade(c.readiness),
      momentumContribution: p.gradeImpact,
      nextExam: exam
        ? {
            id: exam.id,
            title: exam.title,
            date: exam.date,
            daysUntil: getDaysUntil(exam.date),
          }
        : null,
      nextAssignment: assign
        ? {
            id: assign.id,
            title: assign.title,
            dueDate: assign.dueDate,
            daysUntil: getDaysUntil(assign.dueDate),
          }
        : null,
      objective,
      concepts,
      professorEmphasis,
      peerSignalLine: pulse?.networkEffectLine ?? null,
      recommendation,
    };
  });

  const recommendations = [...classSnapshots.map((s) => s.recommendation)].sort(
    (a, b) =>
      b.confidence * b.estimatedLearningGain -
      a.confidence * a.estimatedLearningGain
  );

  const focusClassId = getTopFocusClass().classId;
  const primaryObjective =
    classSnapshots.find((s) => s.classId === focusClassId)?.objective ??
    classSnapshots[0].objective;

  return {
    studentId: studentProfile.name,
    computedAt: new Date().toISOString(),
    momentum,
    primaryObjective,
    classes: classSnapshots,
    recommendations,
  };
}

/**
 * The single highest-impact next activity across all classes.
 */
export function getTopLearningRecommendation(): LearningRecommendation {
  return buildLearningState().recommendations[0];
}

/**
 * Per-class recommendation for surfaces that already know the class.
 */
export function getClassLearningSnapshot(
  classId: string
): ClassLearningSnapshot | null {
  const state = buildLearningState();
  return state.classes.find((s) => s.classId === classId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Silence unused-import warnings for signals reserved for the next   */
/* iteration (captures + streak roll into evidence once persisted).   */
/* ------------------------------------------------------------------ */
void studyStreak;
