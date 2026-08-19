/**
 * Syllabus -> learning context bridge.
 *
 * A syllabus tells us WHAT a class will cover and when. It does not contain
 * teachable content, so this never creates concepts or artifacts: it only
 * surfaces the topics the student's own syllabus already stated as study
 * targets, so capture prompts and the existing Study Intelligence selection
 * path have something to aim at. No academic facts are invented here.
 */
import { normalizeSyllabusTopics } from "./schema";

export interface SyllabusTopicTargetInput {
  schedule?: ReadonlyArray<{ date?: string | null; topic?: string | null }>;
  exams?: ReadonlyArray<{ title?: string | null; exam_date?: string | null; topics?: readonly string[] | null }>;
  /** ISO date key (YYYY-MM-DD) used to prefer what is coming next. */
  today?: string;
  limit?: number;
}

export interface SyllabusTopicTarget {
  topic: string;
  /** "exam" topics come from a stated test; "schedule" from a dated class day. */
  source: "exam" | "schedule";
  date: string;
  label: string;
}

const DEFAULT_LIMIT = 12;

export function buildSyllabusTopicTargets(input: SyllabusTopicTargetInput): SyllabusTopicTarget[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const limit = input.limit ?? DEFAULT_LIMIT;
  const candidates: SyllabusTopicTarget[] = [];

  for (const exam of input.exams ?? []) {
    const date = exam.exam_date ?? "";
    for (const topic of normalizeSyllabusTopics(exam.topics ?? [])) {
      candidates.push({ topic, source: "exam", date, label: exam.title?.trim() || "Test" });
    }
  }
  for (const day of input.schedule ?? []) {
    const topic = normalizeSyllabusTopics([day.topic ?? ""])[0];
    if (!topic) continue;
    candidates.push({ topic, source: "schedule", date: day.date ?? "", label: "Class day" });
  }

  const upcoming = (target: SyllabusTopicTarget) => !target.date || target.date >= today;
  const rank = (target: SyllabusTopicTarget) => {
    const soon = upcoming(target) ? 0 : 1;
    const kind = target.source === "exam" ? 0 : 1;
    return [soon, kind, target.date || "9999-12-31"] as const;
  };

  const seen = new Set<string>();
  return candidates
    .slice()
    .sort((a, b) => {
      const [aSoon, aKind, aDate] = rank(a);
      const [bSoon, bKind, bDate] = rank(b);
      if (aSoon !== bSoon) return aSoon - bSoon;
      if (aKind !== bKind) return aKind - bKind;
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
    })
    .filter((target) => {
      const key = target.topic.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
