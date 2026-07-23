/**
 * Campus Brain — Aggregate Signals Layer.
 *
 * Turns private student actions (captures, study sessions, exam debriefs,
 * professor hints) into ANONYMOUS, aggregate class intelligence.
 *
 * Privacy rules enforced here:
 *   - never expose raw notes, recordings, scans, or exam questions
 *   - only counts, percentages, trends, and safe concept labels leave this module
 *   - at least MIN_STUDENTS distinct students must contribute before an
 *     insight is surfaced; otherwise we return
 *     "still learning" so nothing thin/identifying leaks
 *
 * Data sources (all already aggregate-safe):
 *   - `topic_scores`         — public aggregate view, no user_id
 *   - `campus_brain_signals` — event stream, we only count by class/source
 *
 * We never SELECT raw_text, payload, or user_id fields when composing
 * aggregate insights.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classes } from "@/data/demo";
import type {
  CaptureKind,
  CaptureResult,
} from "@/lib/capture/types";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/** Below this student count, no per-topic insight is surfaced. */
export const MIN_STUDENTS = 10;

export type AggregateSourceType =
  | "capture"
  | "study_session"
  | "exam_debrief"
  | "professor_hint"
  | "textbook_scan"
  | "lecture_recording";

export type ConfidenceBand = "low" | "growing" | "strong";

export interface AggregateInsight {
  /** Stable id so the UI can key by insight. */
  id: string;
  /** Short, safe, human-readable line — never contains raw student text. */
  headline: string;
  /** Optional supporting metric to render as a chip. */
  metric?: string;
  /** Signal source category. */
  source: AggregateSourceType;
  /** Topic label, if the insight is topic-scoped. */
  topic?: string;
  /** Confidence band drives the badge shown in the UI. */
  confidence: ConfidenceBand;
  /** Number of distinct contributing students behind this insight. */
  studentCount: number;
  /** Number of signal rows behind this insight. */
  signalCount: number;
}

export interface AggregateSignalDraft {
  sourceType: AggregateSourceType;
  clientClassId: string;
  professorName?: string | null;
  courseKey?: string | null;
  topic?: string | null;
  chapter?: string | null;
  weight?: number;
  /**
   * Payload MUST be aggregate-safe: counts, tags, tokenised concept names.
   * Never include raw notes, transcripts, or OCR text here.
   */
  payload?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function bandFor(students: number, signals: number): ConfidenceBand {
  if (students >= 12 || signals >= 40) return "strong";
  if (students >= 6 || signals >= 15) return "growing";
  return "low";
}

export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  low: "Low confidence",
  growing: "Growing confidence",
  strong: "Strong signal",
};

/** Safe course key derived from the demo class name (until we resolve
 *  real course_instance_ids). Groups sections of the same course. */
function courseKeyForClass(clientClassId: string): string {
  const cls = classes.find((c) => c.id === clientClassId);
  if (!cls) return clientClassId;
  return cls.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function professorForClass(clientClassId: string): string | null {
  return classes.find((c) => c.id === clientClassId)?.professor ?? null;
}

function warn(scope: string, err: unknown) {
  console.warn(`[aggregateSignals:${scope}]`, err);
}

/* ------------------------------------------------------------------ */
/* Signal extraction (private → aggregate-safe)                        */
/* ------------------------------------------------------------------ */

/**
 * Distill a capture into an anonymous, aggregate-safe signal.
 * Never returns raw text, transcript, or OCR content.
 */
export function extractAggregateSignalFromCapture(
  capture: CaptureResult
): AggregateSignalDraft {
  const kindToSource: Record<CaptureKind, AggregateSourceType> = {
    "record-lecture": "lecture_recording",
    "scan-board": "capture",
    "scan-textbook": "textbook_scan",
    "scan-assignment": "capture",
    "scan-material": "textbook_scan",
    "scan-syllabus": "capture",
    "upload-file": "capture",
    "quick-note": "capture",
    "professor-hint": "professor_hint",
    "ask-brain": "capture",
  };

  return {
    sourceType: kindToSource[capture.kind],
    clientClassId: capture.context.classId,
    professorName: professorForClass(capture.context.classId),
    courseKey: courseKeyForClass(capture.context.classId),
    topic: capture.context.topic ?? null,
    chapter: undefined,
    weight: capture.kind === "professor-hint" ? 3 : 1,
    payload: {
      // Aggregate-safe: only counts + concept labels, no raw content.
      conceptCount: capture.keyConcepts.length,
      concepts: capture.keyConcepts.slice(0, 6),
      hasFlashcards: capture.flashcardCount > 0,
      kind: capture.kind,
    },
  };
}

export interface StudySessionSignalInput {
  clientClassId: string;
  topic?: string | null;
  mode: string;
  accuracy?: number | null;
  durationMinutes?: number;
  incorrectCount?: number;
}

export function extractAggregateSignalFromStudySession(
  input: StudySessionSignalInput
): AggregateSignalDraft {
  return {
    sourceType: "study_session",
    clientClassId: input.clientClassId,
    professorName: professorForClass(input.clientClassId),
    courseKey: courseKeyForClass(input.clientClassId),
    topic: input.topic ?? null,
    weight: 1,
    payload: {
      mode: input.mode,
      accuracyBand:
        input.accuracy == null
          ? null
          : input.accuracy >= 80
            ? "high"
            : input.accuracy >= 60
              ? "mid"
              : "low",
      durationMinutes: input.durationMinutes ?? 0,
      incorrectCount: input.incorrectCount ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Write path                                                          */
/* ------------------------------------------------------------------ */

/**
 * Persist an aggregate-safe signal. Non-throwing.
 * The row is written to `campus_brain_signals` with `anonymized=true` and
 * `visibility='aggregate'` so it can feed public aggregate views.
 */
export async function updateCampusBrainAggregate(
  draft: AggregateSignalDraft
): Promise<boolean> {
  try {
    const { getAnonUserId } = await import("@/hooks/useClassIntelligence");
    const { error } = await supabase.from("campus_brain_signals").insert({
      user_id: getAnonUserId(),
      client_class_id: draft.clientClassId,
      source_type: `agg:${draft.sourceType}`,
      topic: draft.topic ?? null,
      weight: draft.weight ?? 1,
      payload: {
        professor: draft.professorName ?? null,
        courseKey: draft.courseKey ?? null,
        chapter: draft.chapter ?? null,
        ...(draft.payload ?? {}),
      } as never,
      visibility: "aggregate",
      anonymized: true,
    });
    if (error) {
      warn("updateCampusBrainAggregate", error);
      return false;
    }
    return true;
  } catch (err) {
    warn("updateCampusBrainAggregate.catch", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Read path — aggregate insights                                      */
/* ------------------------------------------------------------------ */

interface TopicScoreRow {
  topic_id: string;
  topic_name: string;
  student_count: number;
  star_count: number;
  total_time_spent_minutes: number;
  miss_rate: number;
  post_exam_mentions: number;
  probability: number;
}

/** Build safe, thresholded insights for a single class. */
export async function getAggregateInsightsForClass(
  clientClassId: string
): Promise<AggregateInsight[]> {
  const insights: AggregateInsight[] = [];

  try {
    const scoresRes = await supabase
      .from("topic_scores")
      .select(
        "topic_id, topic_name, student_count, star_count, total_time_spent_minutes, miss_rate, post_exam_mentions, probability"
      )
      .eq("class_id", clientClassId)
      .order("probability", { ascending: false })
      .limit(10);

    const scores = (scoresRes.data ?? []) as TopicScoreRow[];

    // Trending topic (by probability, with threshold)
    const trending = scores.find((t) => t.student_count >= MIN_STUDENTS);
    if (trending) {
      insights.push({
        id: `trend:${trending.topic_id}`,
        headline: `${trending.topic_name} is trending in this class`,
        metric: `${trending.student_count} students`,
        source: "study_session",
        topic: trending.topic_name,
        studentCount: trending.student_count,
        signalCount: trending.student_count,
        confidence: bandFor(trending.student_count, trending.student_count),
      });
    }

    // High miss-rate concept
    const struggled = scores
      .filter((t) => t.student_count >= MIN_STUDENTS && t.miss_rate >= 40)
      .sort((a, b) => b.miss_rate - a.miss_rate)[0];
    if (struggled) {
      insights.push({
        id: `miss:${struggled.topic_id}`,
        headline: `${Math.round(struggled.miss_rate)}% struggled with ${struggled.topic_name}`,
        metric: `${struggled.student_count} students`,
        source: "study_session",
        topic: struggled.topic_name,
        studentCount: struggled.student_count,
        signalCount: struggled.student_count,
        confidence: bandFor(struggled.student_count, struggled.student_count),
      });
    }

    // Post-exam mentions (what actually showed up)
    const examTopic = scores
      .filter((t) => t.student_count >= MIN_STUDENTS && t.post_exam_mentions >= 2)
      .sort((a, b) => b.post_exam_mentions - a.post_exam_mentions)[0];
    if (examTopic) {
      insights.push({
        id: `exam:${examTopic.topic_id}`,
        headline: `${examTopic.topic_name} appeared on ${examTopic.post_exam_mentions} recent exams`,
        source: "exam_debrief",
        topic: examTopic.topic_name,
        studentCount: examTopic.student_count,
        signalCount: examTopic.post_exam_mentions,
        confidence: bandFor(
          examTopic.student_count,
          examTopic.post_exam_mentions * 5
        ),
      });
    }

  } catch (err) {
    warn("getAggregateInsightsForClass", err);
  }

  // Capture-density insight is deliberately omitted for cross-user
  // privacy: raw captures aren't public-readable, so we can't count
  // other students' captures from the client. Once a `capture_signals`
  // aggregate view exists we can add "N students scanned this chapter".

  return insights;
}

/**
 * Roll up aggregate insights across every class taught by a professor.
 * Uses the demo class map to identify which client_class_ids belong to
 * the professor; when real `course_instances.professor_id` is wired
 * this becomes a single query.
 */
export async function getAggregateInsightsForProfessor(
  professorName: string
): Promise<AggregateInsight[]> {
  const classIds = classes
    .filter((c) => c.professor === professorName)
    .map((c) => c.id);
  if (classIds.length === 0) return [];

  const perClass = await Promise.all(
    classIds.map((id) => getAggregateInsightsForClass(id))
  );
  const merged = perClass.flat();

  // Combine matching topic insights so professor-level surfaces get
  // stronger counts than any single class.
  const combined = new Map<string, AggregateInsight>();
  for (const ins of merged) {
    const existing = combined.get(ins.id);
    if (!existing) {
      combined.set(ins.id, { ...ins });
    } else {
      existing.studentCount += ins.studentCount;
      existing.signalCount += ins.signalCount;
      existing.confidence = bandFor(existing.studentCount, existing.signalCount);
    }
  }
  return Array.from(combined.values()).filter(
    (i) => i.studentCount >= MIN_STUDENTS
  );
}

/**
 * Roll up aggregate insights across every section of the same course
 * (identified today by matching class name).
 */
export async function getAggregateInsightsForCourse(
  courseKey: string
): Promise<AggregateInsight[]> {
  const classIds = classes
    .filter((c) => courseKeyForClass(c.id) === courseKey)
    .map((c) => c.id);
  if (classIds.length === 0) return [];

  const perClass = await Promise.all(
    classIds.map((id) => getAggregateInsightsForClass(id))
  );
  const merged = perClass.flat();
  return merged.filter(
    (i) => i.studentCount >= MIN_STUDENTS
  );
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface UseAggregateInsightsResult {
  insights: AggregateInsight[];
  loading: boolean;
  hasEnoughData: boolean;
  topConfidence: ConfidenceBand;
  reload: () => Promise<void>;
}

export function useAggregateInsightsForClass(
  clientClassId: string | null | undefined
): UseAggregateInsightsResult {
  const [insights, setInsights] = useState<AggregateInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!clientClassId) {
      setInsights([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const rows = await getAggregateInsightsForClass(clientClassId);
    setInsights(rows);
    setLoading(false);
  }, [clientClassId]);

  useEffect(() => {
    void reload();
    const onUpdate = () => void reload();
    window.addEventListener("intelligence:updated", onUpdate);
    window.addEventListener("capture:committed", onUpdate);
    return () => {
      window.removeEventListener("intelligence:updated", onUpdate);
      window.removeEventListener("capture:committed", onUpdate);
    };
  }, [reload]);

  const hasEnoughData = insights.length > 0;
  const topConfidence: ConfidenceBand = insights.reduce<ConfidenceBand>(
    (best, i) =>
      i.confidence === "strong"
        ? "strong"
        : i.confidence === "growing" && best !== "strong"
          ? "growing"
          : best,
    "low"
  );

  return { insights, loading, hasEnoughData, topConfidence, reload };
}
