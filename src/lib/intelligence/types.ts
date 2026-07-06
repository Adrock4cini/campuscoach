/**
 * Campus Coach Intelligence Engine — shared types.
 *
 * These types define the shape of every recommendation the engine
 * emits. Pages should consume these instead of computing their own
 * urgency / priority / study-format logic.
 */

export type UrgencyLevel = "critical" | "high" | "medium" | "low";

export interface Reason {
  /** Short, glanceable label (e.g. "Exam in 3 days"). */
  label: string;
  /** Optional tone hint for UI coloring. */
  tone?: "danger" | "warning" | "info" | "success";
  /** Numeric weight this reason contributed to the overall score. */
  weight?: number;
}

/**
 * A prioritized class — "which class deserves attention first?"
 */
export interface ClassPriority {
  classId: string;
  /** 0-100+ composite attention score (higher = more urgent). */
  score: number;
  urgency: UrgencyLevel;
  /** Estimated points-of-final-grade this class can still swing. */
  gradeImpact: number;
  reasons: Reason[];
  /** The single most useful next action for this class right now. */
  nextAction: NextAction;
}

/**
 * A prioritized assignment — "which assignment should they start?"
 */
export interface AssignmentPriority {
  assignmentId: string;
  score: number;
  urgency: UrgencyLevel;
  reasons: Reason[];
  /** Concrete first step the student can take in <5 min. */
  firstStep: string;
  /** Peer-informed context line (may be null when no signal yet). */
  peerLine: string | null;
}

/**
 * Predicted exam topic — "what's most likely to appear on the next exam?"
 */
export interface ExamTopicPrediction {
  topic: string;
  /** 0-100 probability this topic appears / matters. */
  probability: number;
  confidence: "High" | "Medium" | "Low";
  /** Why the engine believes this (peer stars, misses, professor hints…). */
  drivers: string[];
}

/**
 * Recommended study format — "what works best for this student now?"
 */
export interface StudyFormatRecommendation {
  mode: string;
  label: string;
  reason: string;
  /** Suggested topic to attack in that format. */
  topic: string | null;
  /** Suggested minutes for the session. */
  suggestedMinutes: number;
}

/**
 * A concrete next action — the atomic unit the engine emits.
 * Every screen can render one of these as a CTA.
 */
export interface NextAction {
  /** Route the CTA navigates to. */
  to: string;
  /** Verb-first label ("Start 15m sprint", "Draft thesis"). */
  label: string;
  /** One-line rationale ("Highest exam impact this week"). */
  rationale: string;
  /** Icon key from lucide-react, if the caller wants to render one. */
  icon?: string;
}

/**
 * The top-level "what should this student do next?" answer.
 */
export interface CoachBrief {
  primary: NextAction;
  focusClassId: string;
  /** Encouraging status line for the day. */
  status: string;
  /** Total AI-recommended focused minutes for today. */
  recommendedMinutesToday: number;
}

/**
 * Peer struggle — "what are students with the same professor struggling with?"
 */
export interface PeerStruggle {
  topic: string;
  /** 0-100 struggle intensity. */
  intensity: number;
  /** Human line ("62% of peers flagged this last week"). */
  line: string;
}

/* ------------------------------------------------------------------ */
/* Campus Brain — internal student model + surfaced insights          */
/* ------------------------------------------------------------------ */

/**
 * Momentum — a fast-moving companion to readiness. Reflects
 * consistency, streak, and recent study quality. Celebrated because
 * it improves before readiness does.
 */
export interface Momentum {
  /** 0-100 momentum score for today. */
  score: number;
  /** "rising" | "steady" | "cooling" — direction vs. yesterday. */
  trend: "rising" | "steady" | "cooling";
  /** Consecutive-day study streak. */
  streak: number;
  /** Human-readable one-liner Campus Brain can display. */
  line: string;
}

/**
 * Per-class internal state Campus Brain tracks. Not shown directly;
 * consumed via recommendations.
 */
export interface ClassBrainState {
  classId: string;
  readiness: number;
  estimatedGrade: string;
  momentumContribution: number;
  /** Concepts most likely to be forgotten if untouched. */
  fadingConcepts: string[];
  /** Concepts most likely to appear on the next exam. */
  likelyExamTopics: string[];
}

/**
 * The Student Model — the Campus Brain's continuously-updating view
 * of the student. Pages should not read this directly; they should
 * consume insights and recommendations derived from it.
 */
export interface StudentModel {
  academicReadiness: number;
  momentum: Momentum;
  learningPreferences: {
    preferredMode: string;
    preferredSessionMinutes: number;
    tone: string;
  };
  studyHabits: {
    weeklyMinutes: number;
    averageSessionMinutes: number;
    consistentDays: number;
  };
  classes: ClassBrainState[];
  /** Anonymous peer signal Campus Brain is drawing from. */
  campusSignal: {
    contributingStudents: number;
    lastUpdatedLabel: string;
  };
  bestNextAction: NextAction;
}

/**
 * A single insight from Campus Brain — the ONLY shape pages should
 * render. Keeps voice ("Campus Brain noticed…") consistent.
 */
export type CampusBrainInsightKind =
  | "noticed"
  | "predicts"
  | "recommends"
  | "learned";

export interface CampusBrainInsight {
  kind: CampusBrainInsightKind;
  /** The sentence after "Campus Brain <kind>…" (no leading capital). */
  body: string;
  /** Optional class scope. */
  classId?: string;
  /** Optional CTA the UI can render alongside the insight. */
  action?: NextAction;
  /** 0-100 confidence for internal sorting. */
  confidence?: number;
}

