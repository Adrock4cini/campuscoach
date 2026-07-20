/**
 * study_weakest_topic — find weakest high-value concepts and load /
 * generate the best study artifact for them.
 *
 * Concept architecture: reads Concepts + Mastery first (permanent
 * memory), then loads/creates a `learning_artifacts` row (disposable
 * view). Does not bypass Concepts.
 */
import type { CoachFunctionDefinition, CoachFunctionResult } from "../types";
import { loadExams, loadMastery, daysBetween } from "../dataLoaders";

interface Input {
  classId?: string;
  /** artifact kind hint; defaults to flashcards. */
  kind?: "flashcards" | "multiple_choice";
}

export interface StudyWeakestTopicPayload {
  classId: string | null;
  conceptIds: string[];
  conceptNames: string[];
  recommendedKind: "flashcards" | "multiple_choice";
  minutes: number;
}

const WEAK = 0.5;

export const studyWeakestTopic: CoachFunctionDefinition<Input, StudyWeakestTopicPayload> = {
  id: "study_weakest_topic",
  name: "Study weakest topic",
  description:
    "Find the weakest high-value concepts and load/generate the best study artifact for them.",
  category: "study",
  requiredInputs: [],
  optionalInputs: [
    { name: "classId", type: "string", description: "Constrain to a class" },
    { name: "kind", type: "enum", enumValues: ["flashcards", "multiple_choice"], description: "Preferred artifact kind" },
  ],
  outputType: "StudyWeakestTopicPayload",
  async execute(input, ctx): Promise<CoachFunctionResult<StudyWeakestTopicPayload>> {
    const now = ctx.now ?? new Date();
    const [mastery, exams] = await Promise.all([loadMastery(ctx), loadExams(ctx)]);
    const scope = input.classId ? mastery.filter((m) => m.class_id === input.classId) : mastery;

    if (scope.length === 0) {
      return {
        functionId: "study_weakest_topic",
        status: "empty",
        title: "No concepts yet",
        summary:
          "Capture a lecture or note first — study sets are built from the concepts Campus Brain extracts.",
        evidence: [{ type: "capture", label: "0 concepts captured", source: "concepts", confidence: 1, weight: 0.6 }],
        actions: [{ label: "Capture something", to: input.classId ? `/classes/${input.classId}` : "/", kind: "capture" }],
        payload: { classId: input.classId ?? null, conceptIds: [], conceptNames: [], recommendedKind: "flashcards", minutes: 10 },
      };
    }

    // Score = weakness × (1 + emphasis) × (1 + exam-proximity boost).
    const nextExamByClass = new Map<string, number>();
    for (const e of exams) {
      const d = daysBetween(e.exam_date, now);
      if (d === null || d < 0) continue;
      const cur = nextExamByClass.get(e.class_id);
      if (cur === undefined || d < cur) nextExamByClass.set(e.class_id, d);
    }

    const ranked = scope
      .map((m) => {
        const weakness = 1 - m.strength;
        const emphasis = m.professor_emphasis ? 1.4 : 1;
        const examDays = nextExamByClass.get(m.class_id);
        const exam = examDays === undefined ? 1 : 1 + Math.max(0, 1 - examDays / 14) * 0.6;
        return { ...m, score: weakness * emphasis * exam };
      })
      .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, 8);
    const weakCount = top.filter((t) => t.strength < WEAK).length;
    const emphasisCount = top.filter((t) => t.professor_emphasis).length;
    const classId = input.classId ?? top[0].class_id;
    const kind: "flashcards" | "multiple_choice" =
      input.kind ?? (top[0].strength < 0.35 ? "flashcards" : "multiple_choice");

    const nearestExam = [...exams]
      .map((e) => ({ e, d: daysBetween(e.exam_date, now) }))
      .filter((r) => r.d !== null && r.d >= 0 && r.e.class_id === classId)
      .sort((a, b) => (a.d as number) - (b.d as number))[0];

    const evidence = [
      {
        type: "mastery" as const,
        label: `${weakCount} weak concept${weakCount === 1 ? "" : "s"} (strength < 50%)`,
        source: "user_concept_mastery",
        confidence: 1,
        weight: Math.min(1, weakCount / 8 + 0.3),
      },
      ...(emphasisCount > 0
        ? [{
            type: "signal" as const,
            label: `${emphasisCount} flagged by professor`,
            source: "concepts.professor_emphasis",
            confidence: 0.9,
            weight: 0.6,
          }]
        : []),
      ...(nearestExam?.d !== undefined && nearestExam?.d !== null
        ? [{
            type: "exam" as const,
            label: `${nearestExam.e.title} in ${nearestExam.d}d`,
            source: "exams",
            confidence: 1,
            weight: Math.max(0.2, 1 - (nearestExam.d as number) / 14),
          }]
        : []),
    ];

    return {
      functionId: "study_weakest_topic",
      status: "ok",
      title: `Drill your ${weakCount || top.length} weakest concept${top.length === 1 ? "" : "s"}`,
      summary: `Campus Brain picked ${top.length} concepts you're softest on${
        emphasisCount ? `, including ${emphasisCount} your professor emphasized` : ""
      }. ${kind === "flashcards" ? "Flashcards" : "Multiple choice"} first — recall before recognition.`,
      evidence,
      actions: [
        { label: `Study these ${top.length} now`, to: `/study-lab?classId=${encodeURIComponent(classId)}`, kind: "study" },
        { label: "Explain the weakest one", runFunctionId: "explain_concept", input: { conceptId: top[0].concept_id, style: "simple" }, kind: "explain" },
      ],
      minutes: 10,
      estimatedReadinessDelta: Math.round(
        top.reduce((s, t) => s + Math.max(0, 0.075), 0) * 100 / Math.max(1, scope.length),
      ),
      payload: {
        classId,
        conceptIds: top.map((t) => t.concept_id),
        conceptNames: top.map((t) => t.concept_name),
        recommendedKind: kind,
        minutes: 10,
      },
    };
  },
};
