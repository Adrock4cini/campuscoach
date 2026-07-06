/**
 * Campus Coach Intelligence Engine — core.
 *
 * A single decision layer that answers the questions every page asks:
 *   • What should this student do next?
 *   • What will have the biggest impact on their grade?
 *   • Which class deserves attention first?
 *   • Which assignment should they start?
 *   • What concepts are most likely to appear on the next exam?
 *   • What are peers with the same professor struggling with?
 *   • What study format works best right now?
 *
 * Every function here is pure: it reads from the demo data layer
 * (soon to be Supabase-backed) and returns typed recommendations.
 * Pages should NOT compute urgency / priority themselves — they
 * request it from this engine so behavior evolves in one place as
 * more student signal comes in.
 */

import {
  classes,
  exams,
  assignments,
  getDaysUntil,
  studentProfile,
  type Assignment,
  type ClassInfo,
  type Exam,
} from "@/data/demo";
import {
  getPredictedTopics,
  getRecommendedTopic,
  getClassPulse,
  getAssignmentStartSuggestion,
  classProfessorMap,
} from "@/data/courseIntelligence";
import type {
  AssignmentPriority,
  ClassPriority,
  CoachBrief,
  ExamTopicPrediction,
  NextAction,
  PeerStruggle,
  Reason,
  StudyFormatRecommendation,
  UrgencyLevel,
} from "./types";

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const urgencyFromScore = (score: number): UrgencyLevel => {
  if (score >= 110) return "critical";
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
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

/**
 * Estimate how many percentage points of the final grade a class can
 * still swing. Combines readiness gap with the biggest remaining
 * grading category weight — a low-readiness class with a heavy final
 * exam ahead has more grade upside than one already locked in.
 */
const estimateGradeImpact = (c: ClassInfo): number => {
  const gap = Math.max(0, 100 - c.readiness);
  const heaviestWeight =
    c.gradingWeights.reduce((max, w) => Math.max(max, w.weight), 0) || 20;
  return Math.round((gap * heaviestWeight) / 100);
};

/* ------------------------------------------------------------------ */
/* Class-level recommendations                                        */
/* ------------------------------------------------------------------ */

/**
 * Score a single class on how much attention it needs right now.
 * Higher score = more urgent.
 */
function scoreClass(c: ClassInfo): ClassPriority {
  const exam = nextExamFor(c.id);
  const assign = nextAssignmentFor(c.id);
  const examDays = exam ? getDaysUntil(exam.date) : 99;
  const assignDays = assign ? getDaysUntil(assign.dueDate) : 99;

  const reasons: Reason[] = [];
  let score = 0;

  // Readiness gap is the base signal.
  const readinessGap = 100 - c.readiness;
  score += readinessGap;
  if (c.readiness < 55) {
    reasons.push({
      label: `${c.readiness}% ready`,
      tone: c.readiness < 40 ? "danger" : "warning",
      weight: readinessGap,
    });
  }

  // Imminent exam multiplier.
  if (exam && examDays <= 14) {
    const w = examDays <= 3 ? 60 : examDays <= 7 ? 40 : 20;
    score += w;
    reasons.push({
      label: examDays <= 0 ? "Exam today" : `Exam in ${examDays}d`,
      tone: examDays <= 3 ? "danger" : "warning",
      weight: w,
    });
  }

  // Imminent assignment.
  if (assign && assignDays <= 5) {
    const w = assignDays <= 1 ? 32 : assignDays <= 3 ? 20 : 10;
    score += w;
    reasons.push({
      label:
        assignDays <= 0 ? "Assignment due today" : `Assignment in ${assignDays}d`,
      tone: assignDays <= 1 ? "danger" : "warning",
      weight: w,
    });
  }

  const nextAction = buildClassNextAction(c, exam, assign, examDays, assignDays);

  return {
    classId: c.id,
    score,
    urgency: urgencyFromScore(score),
    gradeImpact: estimateGradeImpact(c),
    reasons,
    nextAction,
  };
}

function buildClassNextAction(
  c: ClassInfo,
  exam: Exam | undefined,
  assign: Assignment | undefined,
  examDays: number,
  assignDays: number
): NextAction {
  // Assignment due today/tomorrow beats everything else.
  if (assign && assignDays <= 1) {
    return {
      to: `/assignments/${assign.id}`,
      label: assignDays <= 0 ? "Finish assignment" : "Start assignment",
      rationale: `${assign.title} is due ${
        assignDays <= 0 ? "today" : "tomorrow"
      }`,
      icon: "ClipboardList",
    };
  }
  // Exam within a week — spin up a focus sprint on the top topic.
  if (exam && examDays <= 7) {
    return {
      to: `/focus-sprint?classId=${c.id}&duration=25`,
      label: "Start 25m sprint",
      rationale: `${exam.title} in ${examDays} day${examDays === 1 ? "" : "s"}`,
      icon: "Zap",
    };
  }
  // Low readiness — quick recall session.
  if (c.readiness < 60) {
    return {
      to: `/study-lab?classId=${c.id}`,
      label: "Study 15m",
      rationale: `Bring ${c.name} up from ${c.readiness}%`,
      icon: "Brain",
    };
  }
  // Default healthy state.
  return {
    to: `/classes/${c.id}`,
    label: "Review notes",
    rationale: "Stay ahead",
    icon: "BookOpen",
  };
}

/**
 * Return all classes ordered by urgency. This is the ground truth
 * the Dashboard and Today's Focus consume.
 */
export function getClassPriorities(): ClassPriority[] {
  return [...classes].map(scoreClass).sort((a, b) => b.score - a.score);
}

export function getTopFocusClass(): ClassPriority {
  return getClassPriorities()[0];
}

/* ------------------------------------------------------------------ */
/* Assignment-level recommendations                                   */
/* ------------------------------------------------------------------ */

function scoreAssignment(a: Assignment): AssignmentPriority {
  const days = getDaysUntil(a.dueDate);
  const reasons: Reason[] = [];
  let score = 0;

  const priorityBoost = a.priority === "high" ? 30 : a.priority === "medium" ? 15 : 5;
  score += priorityBoost;
  reasons.push({ label: `${a.priority} priority`, weight: priorityBoost });

  if (days <= 0) {
    score += 80;
    reasons.push({ label: "Due today", tone: "danger", weight: 80 });
  } else if (days <= 1) {
    score += 55;
    reasons.push({ label: "Due tomorrow", tone: "danger", weight: 55 });
  } else if (days <= 3) {
    score += 30;
    reasons.push({ label: `Due in ${days}d`, tone: "warning", weight: 30 });
  } else if (days <= 7) {
    score += 12;
    reasons.push({ label: `Due in ${days}d`, tone: "info", weight: 12 });
  }

  // Not-started tasks get a small nudge — the hardest part is starting.
  if (a.status === "not-started") {
    score += 8;
    reasons.push({ label: "Not started", weight: 8 });
  }

  const peer = getAssignmentStartSuggestion(a.id);
  return {
    assignmentId: a.id,
    score,
    urgency: urgencyFromScore(score),
    reasons,
    firstStep:
      peer?.step ??
      "Open the doc, write the title, and list three things you'll cover.",
    peerLine: peer?.supportingLine ?? null,
  };
}

export function getAssignmentPriorities(): AssignmentPriority[] {
  return assignments
    .filter((a) => a.status !== "turned-in")
    .map(scoreAssignment)
    .sort((a, b) => b.score - a.score);
}

export function getAssignmentPriority(
  id: string
): AssignmentPriority | null {
  const a = assignments.find((x) => x.id === id);
  return a ? scoreAssignment(a) : null;
}

/* ------------------------------------------------------------------ */
/* Exam predictions                                                   */
/* ------------------------------------------------------------------ */

export function getExamTopicPredictions(
  classId: string
): ExamTopicPrediction[] {
  return getPredictedTopics(classId).map((t) => ({
    topic: t.topic,
    probability: t.probability,
    confidence: t.confidence,
    drivers: t.flags,
  }));
}

/**
 * Rough letter-grade estimate for a given readiness score. Kept in
 * the engine so every exam surface uses the same scale.
 */
export function estimateExamGrade(readiness: number): string {
  if (readiness >= 85) return "A/A-";
  if (readiness >= 75) return "A-/B+";
  if (readiness >= 65) return "B/B-";
  if (readiness >= 50) return "C+/B-";
  if (readiness >= 40) return "C/C-";
  return "D/F";
}

/* ------------------------------------------------------------------ */
/* Study-format recommendation                                        */
/* ------------------------------------------------------------------ */

export function getStudyFormatRecommendation(
  classId: string
): StudyFormatRecommendation {
  const cls = classes.find((c) => c.id === classId);
  const topic = getRecommendedTopic(classId);
  const topicName = topic?.topic ?? null;

  // Session length preference from the student profile — respects ADHD-friendly
  // defaults instead of forcing a 45-minute block on everyone.
  const suggestedMinutes =
    studentProfile.sessionLengthMinutes ?? (cls && cls.readiness < 50 ? 15 : 25);

  if (!cls || !topic) {
    return {
      mode: "flashcards",
      label: "Flashcards",
      reason: "Best low-friction start when there isn't strong signal yet.",
      topic: topicName,
      suggestedMinutes,
    };
  }

  if (cls.readiness < 45) {
    return {
      mode: "flashcards",
      label: "Flashcards",
      reason: `Build recall on ${topic.topic} before adding pressure.`,
      topic: topicName,
      suggestedMinutes,
    };
  }
  if (cls.readiness < 70) {
    return {
      mode: "multiple-choice",
      label: "Multiple Choice",
      reason: `${topic.topic} is high-likelihood — practice picking answers under pressure.`,
      topic: topicName,
      suggestedMinutes,
    };
  }
  return {
    mode: "timed-challenge",
    label: "Timed Challenge",
    reason: `You're solid on ${topic.topic}. Pressure-test it.`,
    topic: topicName,
    suggestedMinutes,
  };
}

/* ------------------------------------------------------------------ */
/* Peer struggles                                                     */
/* ------------------------------------------------------------------ */

export function getPeerStruggles(classId: string): PeerStruggle[] {
  const pulse = getClassPulse(classId);
  if (!pulse) return [];
  return getPredictedTopics(classId)
    .slice(0, 3)
    .map((t) => ({
      topic: t.topic,
      intensity: t.probability,
      line: t.supportingLine ?? pulse.networkEffectLine ?? "",
    }));
}

export function getSameProfessorSignal(classId: string): string | null {
  const profId = classProfessorMap[classId];
  if (!profId) return null;
  const pulse = getClassPulse(classId);
  return pulse?.networkEffectLine ?? null;
}

/* ------------------------------------------------------------------ */
/* Coach brief — the single "what next?" answer                       */
/* ------------------------------------------------------------------ */

export function getCoachBrief(): CoachBrief {
  const top = getTopFocusClass();
  const activeAssignments = assignments.filter((a) => a.status !== "turned-in");
  const overdue = activeAssignments.filter((a) => getDaysUntil(a.dueDate) < 0);
  const avgReadiness =
    classes.reduce((sum, c) => sum + c.readiness, 0) / classes.length;

  const status =
    overdue.length > 0
      ? "Let's catch up today."
      : avgReadiness >= 75
        ? "You're ahead this week."
        : avgReadiness >= 55
          ? "You're on track."
          : "One focused session will get you back on track.";

  // Recommend more minutes when readiness is low or an exam looms.
  const upcomingExamDays = exams
    .map((e) => getDaysUntil(e.date))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)[0];
  const recommendedMinutesToday =
    (avgReadiness < 60 ? 45 : avgReadiness < 75 ? 30 : 20) +
    (upcomingExamDays !== undefined && upcomingExamDays <= 5 ? 15 : 0);

  return {
    primary: top.nextAction,
    focusClassId: top.classId,
    status,
    recommendedMinutesToday,
  };
}
