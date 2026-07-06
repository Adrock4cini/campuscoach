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
