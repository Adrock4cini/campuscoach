/**
 * what_should_i_do_now — the single highest-impact action for the
 * next 10–25 minutes.
 *
 * Reads permanent memory (mastery, exams, assignments, classes) and
 * runs the pure `recommend()` ranker (Prediction layer). Returns the
 * top-ranked recommendation with structured evidence.
 */
import { recommend } from "@/lib/coach/recommend";
import type { CoachFunctionDefinition, CoachFunctionResult } from "../types";
import {
  loadAssignments,
  loadClasses,
  loadExams,
  loadMastery,
} from "../dataLoaders";

interface Input {
  /** Optional: constrain to a single class. */
  classId?: string;
}

export interface WhatShouldIDoNowPayload {
  classId: string;
  className: string;
  action: string;
  conceptIds: string[];
  why: string;
  minutes: number;
  runnerUp: Array<{ classId: string; className: string; why: string; readinessDelta: number }>;
}

export const whatShouldIDoNow: CoachFunctionDefinition<Input, WhatShouldIDoNowPayload> = {
  id: "what_should_i_do_now",
  name: "What should I do now?",
  description: "Return the single highest-impact action for the next 10–25 minutes.",
  category: "plan",
  requiredInputs: [],
  optionalInputs: [
    { name: "classId", type: "string", description: "Constrain to one class" },
  ],
  outputType: "WhatShouldIDoNowPayload",
  async execute(input, ctx): Promise<CoachFunctionResult<WhatShouldIDoNowPayload>> {
    const now = ctx.now ?? new Date();
    const [classes, mastery, exams, assignments] = await Promise.all([
      loadClasses(ctx),
      loadMastery(ctx),
      loadExams(ctx),
      loadAssignments(ctx),
    ]);

    const scoped = input.classId ? classes.filter((c) => c.id === input.classId) : classes;
    if (scoped.length === 0) {
      return {
        functionId: "what_should_i_do_now",
        status: "empty",
        title: "Add your first class",
        summary: "Campus Brain needs at least one class to plan your day.",
        evidence: [],
        actions: [{ label: "Add a class", to: "/onboarding", kind: "capture" }],
        payload: {
          classId: "", className: "", action: "capture", conceptIds: [], why: "", minutes: 0, runnerUp: [],
        },
      };
    }

    const recs = recommend({
      now,
      classes: scoped.map((c) => ({ id: c.id, name: c.name, currentReadiness: c.readiness ?? undefined })),
      mastery: mastery.map((m) => ({
        concept_id: m.concept_id, class_id: m.class_id, strength: m.strength,
        next_review_at: m.next_review_at, attempts: m.attempts,
      })),
      exams: exams.map((e) => ({ class_id: e.class_id, exam_date: e.exam_date, title: e.title, weight: e.weight })),
      assignments: assignments.map((a) => ({ class_id: a.class_id, due_date: a.due_date, title: a.title })),
    });

    const top = recs[0];
    if (!top) {
      return {
        functionId: "what_should_i_do_now",
        status: "empty",
        title: "Nothing urgent",
        summary: "Everything looks caught up. Capture something new when your next class ends.",
        evidence: [],
        actions: [],
        payload: {
          classId: "", className: "", action: "idle", conceptIds: [], why: "You're caught up.", minutes: 0, runnerUp: [],
        },
      };
    }

    const evidence = top.evidence.map((e) => ({
      type: e.type,
      label: e.label,
      source:
        e.type === "exam" ? "exams"
        : e.type === "assignment" ? "assignments"
        : e.type === "review" ? "user_concept_mastery.next_review_at"
        : e.type === "mastery" ? "user_concept_mastery"
        : e.type === "capture" ? "captures"
        : "trend",
      confidence: Math.min(1, Math.max(0.3, e.weight + 0.2)),
      weight: e.weight,
    }));

    const to = top.action === "capture"
      ? `/classes/${top.classId}`
      : `/study-lab?classId=${encodeURIComponent(top.classId)}`;

    return {
      functionId: "what_should_i_do_now",
      status: "ok",
      title: top.className,
      summary: top.why,
      evidence,
      actions: [
        { label: top.action === "capture" ? "Capture something" : `Start ${top.minutes}-min ${top.action}`, to, kind: top.action as never },
        { label: "What am I forgetting?", runFunctionId: "what_am_i_forgetting", kind: "review" },
      ],
      estimatedReadinessDelta: top.impact.readinessDelta,
      minutes: top.minutes,
      payload: {
        classId: top.classId,
        className: top.className,
        action: top.action,
        conceptIds: top.conceptIds,
        why: top.why,
        minutes: top.minutes,
        runnerUp: recs.slice(1, 4).map((r) => ({
          classId: r.classId, className: r.className, why: r.why, readinessDelta: r.impact.readinessDelta,
        })),
      },
    };
  },
};
