/**
 * App-facing strategy-effectiveness evidence.
 *
 * The derivation itself lives with the Edge function shared code so the
 * generator and Study Lab can never disagree about what "has worked for this
 * student" means. This module re-exports it and adds the owner-scoped read
 * plus the explicit-feedback write.
 *
 * Nothing here labels the student. Evidence is always scoped to a subject
 * profile and a task kind, decays with time, and needs a minimum sample count
 * before it is allowed to move any ranking.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  summarizeStrategyEvidence,
  type StrategyEvidence,
  type StrategyOutcomeRecord,
} from "../../../supabase/functions/_shared/strategy-evidence";

export {
  EVIDENCE_DEFAULTS,
  MAX_EVIDENCE_ADJUSTMENT,
  evidenceAdjustment,
  evidenceNote,
  orderFormatsByEvidence,
  summarizeStrategyEvidence,
} from "../../../supabase/functions/_shared/strategy-evidence";

export type {
  EvidenceOptions,
  StrategyEvidence,
  StrategyOutcomeRecord,
  StrategyOutcomeSource,
} from "../../../supabase/functions/_shared/strategy-evidence";

const LOOKBACK_ROWS = 200;

interface EvidenceQuery {
  subjectProfileId?: string | null;
  /**
   * Task kind to scope evidence to. Pass `null` to compare across task kinds
   * (used for study-format ordering, where each format carries its own task
   * kind); those rows are collapsed into a single bucket so formats stay
   * comparable, and strategy-level evidence is never mixed this way.
   */
  taskKind?: string | null;
  enabled?: boolean;
}

/**
 * Loads this student's own outcome rows (RLS keeps it owner-only) and
 * summarizes them. Returns an empty list on any failure so a cold start and a
 * network error behave identically: subject defaults stay in charge.
 */
export function useStrategyEvidence({ subjectProfileId, taskKind, enabled = true }: EvidenceQuery) {
  const [evidence, setEvidence] = useState<StrategyEvidence[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !subjectProfileId) {
      setEvidence([]);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from("study_strategy_outcomes")
        .select("strategy_id, technique, format, subject_profile, task_kind, correct, total, mastery_delta, outcome_source, occurred_at")
        .eq("subject_profile", subjectProfileId);
      if (taskKind) query = query.eq("task_kind", taskKind);
      const { data, error } = await query
        .order("occurred_at", { ascending: false })
        .limit(LOOKBACK_ROWS);
      if (error || !data) {
        setEvidence([]);
        return;
      }
      const records: StrategyOutcomeRecord[] = data.map((row) => ({
        strategyId: row.strategy_id,
        technique: row.technique,
        format: row.format,
        subjectProfileId: row.subject_profile,
        taskKind: taskKind ? row.task_kind : null,
        correct: Number(row.correct),
        total: Number(row.total),
        masteryDelta: row.mastery_delta === null ? null : Number(row.mastery_delta),
        source: row.outcome_source === "feedback" ? "feedback" : "study_result",
        occurredAt: row.occurred_at,
      }));
      setEvidence(summarizeStrategyEvidence(records));
    } catch {
      setEvidence([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, subjectProfileId, taskKind]);

  useEffect(() => { void load(); }, [load]);

  return useMemo(() => ({ evidence, loading, reload: load }), [evidence, loading, load]);
}

export interface StrategyFeedbackOutcome {
  helpful: boolean;
  strategyId?: string | null;
  technique?: string | null;
  modality?: string | null;
  subjectProfileId?: string | null;
  taskKind?: string | null;
  classId?: string | null;
  artifactId?: string | null;
}

/**
 * Records an explicit Helpful / Show-another tap as durable evidence.
 * Best-effort: a failed write must never block the student's study flow.
 */
export async function recordStrategyFeedbackOutcome(input: StrategyFeedbackOutcome): Promise<boolean> {
  if (!input.strategyId && !input.technique) return false;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;
    const { error } = await supabase.from("study_strategy_outcomes").insert({
      user_id: userId,
      class_id: input.classId ?? null,
      artifact_id: input.artifactId ?? null,
      subject_profile: input.subjectProfileId ?? "general",
      task_kind: input.taskKind ?? null,
      format: null,
      strategy_id: input.strategyId ?? null,
      technique: input.technique ?? null,
      modality: input.modality ?? null,
      outcome_source: "feedback",
      correct: input.helpful ? 1 : 0,
      total: 1,
      mastery_delta: null,
    });
    return !error;
  } catch {
    return false;
  }
}
