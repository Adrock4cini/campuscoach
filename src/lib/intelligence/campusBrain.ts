/**
 * Campus Brain — the central intelligence layer.
 *
 * Maintains an internal Student Model that continuously updates from
 * every interaction (study sessions, streaks, peer signal, exam
 * proximity, professor tendencies). Pages never render the model
 * directly; they consume typed insights so the voice stays consistent
 * ("Campus Brain noticed…", "Campus Brain predicts…").
 *
 * As real signal replaces the demo data layer, only this file grows —
 * every screen keeps working because it only sees insights.
 */

import {
  classes,
  exams,
  assignments,
  studySessions,
  studentProfile,
  studyStreak,
  getDaysUntil,
} from "@/data/demo";
import {
  getClassPulse,
  getPredictedTopics,
  getRecommendedTopic,
} from "@/data/courseIntelligence";
import {
  estimateExamGrade,
  getClassPriorities,
  getCoachBrief,
  getTopFocusClass,
} from "./engine";
import type {
  CampusBrainInsight,
  ClassBrainState,
  Momentum,
  StudentModel,
} from "./types";
import {
  getEffectiveReadiness,
  getMomentumBoost,
} from "./readinessEngine";

/* ------------------------------------------------------------------ */
/* Momentum                                                            */
/* ------------------------------------------------------------------ */

function daysAgo(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Momentum moves fast: streak, recent-day activity, and study
 * quality. Bounded 0-100. Readiness only nudges it slightly so a
 * behind-in-class student can still feel a win from showing up today.
 */
export function computeMomentum(): Momentum {
  const last3 = studySessions.filter((s) => daysAgo(s.date) <= 3);
  const last7 = studySessions.filter((s) => daysAgo(s.date) <= 7);
  const yesterday = studySessions.filter((s) => daysAgo(s.date) === 1);
  const today = studySessions.filter((s) => daysAgo(s.date) === 0);

  const scored = last7.filter((s) => typeof s.score === "number");
  const avgScore =
    scored.length > 0
      ? scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length
      : 60;

  let score =
    30 +
    Math.min(studyStreak, 10) * 4 + // up to +40 for a 10-day streak
    Math.min(last3.length, 6) * 4 + // up to +24 for consistent recent days
    (avgScore - 50) * 0.3 + // quality nudge, ±15
    getMomentumBoost(); // recent completions in this session
  score = Math.max(0, Math.min(100, Math.round(score)));

  const trend: Momentum["trend"] =
    today.length > yesterday.length
      ? "rising"
      : today.length < yesterday.length
        ? "cooling"
        : "steady";

  const line =
    score >= 75
      ? `You're on a ${studyStreak}-day streak — keep the wave going.`
      : score >= 55
        ? "Small, steady wins are stacking up."
        : score >= 35
          ? "One short session today will restart your momentum."
          : "Momentum resets fast — 10 focused minutes counts.";

  return { score, trend, streak: studyStreak, line };
}

/* ------------------------------------------------------------------ */
/* Student Model                                                       */
/* ------------------------------------------------------------------ */

function classState(classId: string): ClassBrainState {
  const cls = classes.find((c) => c.id === classId)!;
  const pulse = getClassPulse(classId);
  const predicted = getPredictedTopics(classId).slice(0, 3).map((t) => t.topic);
  const fading =
    pulse && pulse.mostStruggled ? [pulse.mostStruggled.topic] : [];

  const classSessions = studySessions.filter((s) => s.classId === classId);
  const contribution = Math.min(20, classSessions.length * 4);

  const effective = getEffectiveReadiness(classId, cls.readiness);
  return {
    classId,
    readiness: effective,
    estimatedGrade: estimateExamGrade(effective),
    momentumContribution: contribution,
    fadingConcepts: fading,
    likelyExamTopics: predicted,
  };
}

export function getStudentModel(): StudentModel {
  const momentum = computeMomentum();
  const coach = getCoachBrief();
  const avgReadiness =
    classes.reduce((s, c) => s + getEffectiveReadiness(c.id, c.readiness), 0) /
    classes.length;

  const totalMinutes = studySessions.reduce((s, x) => s + x.duration, 0);
  const avgSession = totalMinutes / Math.max(1, studySessions.length);
  const consistentDays = new Set(
    studySessions.filter((s) => daysAgo(s.date) <= 7).map((s) => s.date)
  ).size;

  const modeCounts: Record<string, number> = {};
  studySessions.forEach((s) => {
    modeCounts[s.type] = (modeCounts[s.type] ?? 0) + 1;
  });
  const preferredMode =
    Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Flashcards";

  return {
    academicReadiness: Math.round(avgReadiness),
    momentum,
    learningPreferences: {
      preferredMode,
      preferredSessionMinutes: studentProfile.defaultStudyLength,
      tone: studentProfile.encouragementTone,
    },
    studyHabits: {
      weeklyMinutes: totalMinutes,
      averageSessionMinutes: Math.round(avgSession),
      consistentDays,
    },
    classes: classes.map((c) => classState(c.id)),
    campusSignal: {
      contributingStudents: 148, // rolled up in the engine as real signal lands
      lastUpdatedLabel: "updated moments ago",
    },
    bestNextAction: coach.primary,
  };
}

/* ------------------------------------------------------------------ */
/* Insights — the ONLY shape pages should render                       */
/* ------------------------------------------------------------------ */

/**
 * Top insight for the whole app — the one line Campus Brain would
 * lead with if it could only say one thing.
 */
export function getTopCampusBrainInsight(): CampusBrainInsight {
  const top = getTopFocusClass();
  const cls = classes.find((c) => c.id === top.classId)!;
  const pulse = getClassPulse(cls.id);
  const exam = exams
    .filter((e) => e.classId === cls.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const examDays = exam ? getDaysUntil(exam.date) : null;

  if (exam && examDays !== null && examDays <= 7 && pulse) {
    return {
      kind: "predicts",
      body: `"${pulse.mostStruggled.topic}" is the most likely topic on your ${cls.name} exam in ${examDays}d.`,
      classId: cls.id,
      action: top.nextAction,
      confidence: 88,
    };
  }
  if (cls.readiness < 60) {
    return {
      kind: "noticed",
      body: `${cls.name} needs the most attention right now — a short session will move readiness the fastest.`,
      classId: cls.id,
      action: top.nextAction,
      confidence: 82,
    };
  }
  return {
    kind: "recommends",
    body: `${top.nextAction.label.toLowerCase()} — ${top.nextAction.rationale.toLowerCase()}.`,
    classId: cls.id,
    action: top.nextAction,
    confidence: 70,
  };
}

/**
 * Per-class insight surfaced on class cards / class detail.
 */
export function getClassCampusBrainInsight(
  classId: string
): CampusBrainInsight | null {
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return null;
  const pulse = getClassPulse(classId);
  const topic = getRecommendedTopic(classId);
  const priority = getClassPriorities().find((p) => p.classId === classId);
  const exam = exams
    .filter((e) => e.classId === classId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const examDays = exam ? getDaysUntil(exam.date) : null;

  if (pulse && examDays !== null && examDays <= 10) {
    return {
      kind: "predicts",
      body: `"${pulse.mostStruggled.topic}" tends to show up on this professor's exams.`,
      classId,
      action: priority?.nextAction,
      confidence: 84,
    };
  }
  if (topic && cls.readiness < 70) {
    return {
      kind: "recommends",
      body: `start with ${topic.topic} — highest payoff for time spent.`,
      classId,
      action: priority?.nextAction,
      confidence: 76,
    };
  }
  if (pulse) {
    return {
      kind: "noticed",
      body: `${pulse.mostStruggled.studentCount} classmates flagged ${pulse.mostStruggled.topic} recently.`,
      classId,
      action: priority?.nextAction,
      confidence: 68,
    };
  }
  return {
    kind: "learned",
    body: `your best sessions in ${cls.name} were short and mid-morning.`,
    classId,
    confidence: 55,
  };
}

/**
 * Assignment-scoped insight ("Campus Brain noticed peers usually get
 * stuck on the second paragraph — start there").
 */
export function getAssignmentCampusBrainInsight(
  assignmentId: string
): CampusBrainInsight | null {
  const a = assignments.find((x) => x.id === assignmentId);
  if (!a) return null;
  const days = getDaysUntil(a.dueDate);
  if (days <= 1) {
    return {
      kind: "recommends",
      body: `open a blank doc and write the title — starting is 80% of finishing.`,
      confidence: 90,
    };
  }
  return {
    kind: "learned",
    body: `you finish faster when you break this type of task into 3 short steps.`,
    confidence: 65,
  };
}
