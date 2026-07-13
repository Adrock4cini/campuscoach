/**
 * prepare_for_exam — build a concept-first exam prep plan.
 *
 * Reads exam metadata + Mastery for the exam's class, ranks concepts
 * by readiness gap × emphasis, produces a phased study sequence.
 */
import type { CoachFunctionDefinition, CoachFunctionResult } from "../types";
import { daysBetween, loadExams, loadMastery } from "../dataLoaders";

interface Input {
  examId: string;
}

export interface PrepareForExamPayload {
  examId: string;
  examTitle: string;
  classId: string;
  daysUntil: number | null;
  priorityConceptIds: string[];
  sequence: Array<{ phase: string; minutes: number; conceptIds: string[]; suggestedKind: "flashcards" | "multiple_choice" | "practice" }>;
  totalMinutes: number;
  readinessGap: number; // 0..100 points below "exam-ready" (85)
}

const TARGET_READINESS = 85;

export const prepareForExam: CoachFunctionDefinition<Input, PrepareForExamPayload> = {
  id: "prepare_for_exam",
  name: "Prepare for exam",
  description:
    "Build a concept-first exam prep plan from real mastery and professor emphasis.",
  category: "predict",
  requiredInputs: [{ name: "examId", type: "string", description: "The exam to prepare for" }],
  optionalInputs: [],
  outputType: "PrepareForExamPayload",
  async execute(input, ctx): Promise<CoachFunctionResult<PrepareForExamPayload>> {
    const now = ctx.now ?? new Date();
    const [exams, mastery] = await Promise.all([loadExams(ctx), loadMastery(ctx)]);
    const exam = exams.find((e) => e.id === input.examId);
    if (!exam) {
      return {
        functionId: "prepare_for_exam",
        status: "error",
        title: "Exam not found",
        summary: "That exam doesn't exist or isn't yours.",
        evidence: [],
        actions: [],
        payload: { examId: input.examId, examTitle: "", classId: "", daysUntil: null, priorityConceptIds: [], sequence: [], totalMinutes: 0, readinessGap: 0 },
        error: "exam not found",
      };
    }

    const days = daysBetween(exam.exam_date, now);
    const classMastery = mastery.filter((m) => m.class_id === exam.class_id);
    if (classMastery.length === 0) {
      return {
        functionId: "prepare_for_exam",
        status: "empty",
        title: `Prep plan for ${exam.title}`,
        summary:
          "No concepts captured for this class yet. Capture lectures or notes first — the plan is built from your real concepts.",
        evidence: [
          {
            type: "capture",
            label: "0 concepts captured for this class",
            source: "concepts",
            confidence: 1,
            weight: 0.7,
          },
          ...(days !== null
            ? [{
                type: "exam" as const,
                label: `${exam.title} in ${days}d`,
                source: "exams",
                confidence: 1,
                weight: Math.max(0.2, 1 - days / 14),
              }]
            : []),
        ],
        actions: [{ label: "Capture something", to: `/class/${exam.class_id}`, kind: "capture" }],
        payload: {
          examId: exam.id, examTitle: exam.title, classId: exam.class_id, daysUntil: days,
          priorityConceptIds: [], sequence: [], totalMinutes: 0, readinessGap: TARGET_READINESS,
        },
      };
    }

    const ranked = classMastery
      .map((m) => ({
        ...m,
        priority: (1 - m.strength) * (m.professor_emphasis ? 1.5 : 1),
      }))
      .sort((a, b) => b.priority - a.priority);

    const avg = classMastery.reduce((s, m) => s + m.strength, 0) / classMastery.length;
    const readinessGap = Math.max(0, TARGET_READINESS - Math.round(avg * 100));

    // Phased sequence — front-load the weakest, drill recall, then MCQ.
    const priority = ranked.slice(0, Math.min(8, ranked.length));
    const midtier = ranked.slice(priority.length, priority.length + 6);
    const sequence: PrepareForExamPayload["sequence"] = [
      {
        phase: "Recall weakest",
        minutes: 15,
        conceptIds: priority.map((r) => r.concept_id),
        suggestedKind: "flashcards",
      },
      ...(midtier.length
        ? [{
            phase: "Pressure-test",
            minutes: 15,
            conceptIds: midtier.map((r) => r.concept_id),
            suggestedKind: "multiple_choice" as const,
          }]
        : []),
      ...(days !== null && days <= 3
        ? [{
            phase: "Simulate",
            minutes: 20,
            conceptIds: ranked.slice(0, 10).map((r) => r.concept_id),
            suggestedKind: "practice" as const,
          }]
        : []),
    ];

    const emphasisCount = priority.filter((p) => p.professor_emphasis).length;
    const evidence = [
      ...(days !== null
        ? [{
            type: "exam" as const,
            label: `${exam.title} in ${days}d`,
            source: "exams",
            confidence: 1,
            weight: Math.max(0.2, 1 - days / 14),
          }]
        : []),
      {
        type: "readiness" as const,
        label: `Class average strength ${Math.round(avg * 100)}% (target ${TARGET_READINESS}%)`,
        source: "user_concept_mastery",
        confidence: 1,
        weight: Math.min(1, readinessGap / 50),
      },
      {
        type: "mastery" as const,
        label: `${priority.length} concept${priority.length === 1 ? "" : "s"} below target`,
        source: "user_concept_mastery",
        confidence: 1,
        weight: Math.min(1, priority.length / 8),
      },
      ...(emphasisCount > 0
        ? [{
            type: "signal" as const,
            label: `${emphasisCount} concept${emphasisCount === 1 ? "" : "s"} the professor emphasized`,
            source: "concepts.professor_emphasis",
            confidence: 0.9,
            weight: 0.6,
          }]
        : []),
    ];

    const totalMinutes = sequence.reduce((s, p) => s + p.minutes, 0);

    return {
      functionId: "prepare_for_exam",
      status: "ok",
      title: `Prep plan for ${exam.title}`,
      summary: `${sequence.length}-phase plan · ~${totalMinutes} min · closes an estimated ${readinessGap}-point readiness gap.`,
      evidence,
      actions: [
        { label: `Start phase 1 (${sequence[0].minutes}m)`, to: `/study-lab?classId=${encodeURIComponent(exam.class_id)}`, kind: "study" },
        { label: "Explain the toughest one", runFunctionId: "explain_concept", input: { conceptId: priority[0].concept_id, style: "professor" }, kind: "explain" },
      ],
      minutes: totalMinutes,
      estimatedReadinessDelta: Math.min(readinessGap, 8),
      payload: {
        examId: exam.id,
        examTitle: exam.title,
        classId: exam.class_id,
        daysUntil: days,
        priorityConceptIds: priority.map((p) => p.concept_id),
        sequence,
        totalMinutes,
        readinessGap,
      },
    };
  },
};
