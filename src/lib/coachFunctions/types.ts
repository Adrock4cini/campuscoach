/**
 * Campus Coach Function Engine — shared contract.
 *
 * The Function Engine is the ONE layer the UI calls to execute an
 * academic action. Every button that used to compute its own
 * "priority" or "next step" should instead invoke a registered
 * coach function.
 *
 * Concept architecture invariant (mem://constraints/concept-architecture):
 *   concepts + user_concept_mastery are permanent memory.
 *   learning_artifacts are disposable views.
 *   No function may bypass Concepts.
 *   Study results must write back to user_concept_mastery.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CoachFunctionCategory =
  | "plan"
  | "study"
  | "understand"
  | "predict"
  | "memory"
  | "capture";

export type EvidenceType =
  | "exam"
  | "assignment"
  | "mastery"
  | "review"
  | "capture"
  | "trend"
  | "signal"
  | "readiness";

export interface CoachEvidence {
  type: EvidenceType;
  label: string;
  /** Human-readable source (e.g. "user_concept_mastery", "exams", "topic_signals"). */
  source: string;
  /** 0..1 confidence in this piece of evidence. */
  confidence: number;
  /** 0..1 weight this evidence contributes to the score / decision. */
  weight: number;
}

export type CoachActionKind =
  | "study"
  | "review"
  | "capture"
  | "debrief"
  | "explain"
  | "plan";

export interface CoachActionCTA {
  /** Verb-first label ("Start 10-min study"). */
  label: string;
  /** Route to navigate to when the CTA is chosen. */
  to?: string;
  /** Function id to run next (chain). */
  runFunctionId?: string;
  /** Optional payload to pass to the chained function. */
  input?: unknown;
  kind?: CoachActionKind;
}

export interface CoachFunctionResult<P = unknown> {
  functionId: string;
  status: "ok" | "empty" | "error";
  title: string;
  summary: string;
  evidence: CoachEvidence[];
  actions: CoachActionCTA[];
  /** Estimated readiness delta if the recommendation is completed. */
  estimatedReadinessDelta?: number;
  /** Suggested minutes of focused work. */
  minutes?: number;
  /** Structured, function-specific payload. */
  payload: P;
  /** Error message when `status === "error"`. */
  error?: string;
}

export interface CoachFunctionContext {
  supabase: SupabaseClient;
  userId: string;
  now?: Date;
}

export interface CoachFunctionInputField {
  name: string;
  type: "string" | "number" | "string[]" | "date" | "enum";
  enumValues?: string[];
  description: string;
}

export interface CoachFunctionDefinition<I = unknown, P = unknown> {
  id: string;
  name: string;
  description: string;
  category: CoachFunctionCategory;
  requiredInputs: CoachFunctionInputField[];
  optionalInputs: CoachFunctionInputField[];
  outputType: string;
  execute: (
    input: I,
    ctx: CoachFunctionContext,
  ) => Promise<CoachFunctionResult<P>>;
}
