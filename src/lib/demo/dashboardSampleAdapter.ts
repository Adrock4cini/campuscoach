import {
  classes as seededClasses,
  type ClassInfo,
} from "@/data/demo";
import {
  recommend,
  type CoachInputMastery,
  type CoachRecommendation,
} from "@/lib/coach/recommend";
import {
  buildDashboardAgenda,
  type DashboardAgendaItem,
} from "@/lib/calendar/dashboardAgenda";
import { toDateKey } from "@/lib/calendar/dateKey";

export type DemoClassAgendaItem = Extract<DashboardAgendaItem, { kind: "class" }>;

export interface DemoWeakSpot {
  id: string;
  name: string;
  reason: string;
}

export interface DemoDashboardModel {
  classes: ClassInfo[];
  recommendations: CoachRecommendation[];
  agenda: DemoClassAgendaItem[];
  weakSpots: DemoWeakSpot[];
}

const COURSE_CODES: Record<string, string> = {
  psych101: "PSY 101",
  bio200: "BIO 200",
  eng102: "ENG 102",
  math150: "MATH 150",
};

/**
 * Frozen sample content, placed on dates relative to today.
 *
 * The old demo used literal Spring 2026 dates, so urgency labels became stale.
 * This adapter keeps the sample story deterministic without importing or
 * reading any authenticated data source.
 */
export function buildDemoDashboardModel(now = new Date()): DemoDashboardModel {
  const semesterStartDate = dateAtOffset(now, -28);
  const semesterEndDate = dateAtOffset(now, 112);

  const classes = seededClasses.map((classInfo) => ({
    ...classInfo,
    courseCode: COURSE_CODES[classInfo.id] ?? classInfo.courseCode,
    semesterStartDate,
    semesterEndDate,
    schedule: [],
  }));

  const datedClasses = classes.map((classInfo) => ({
    ...classInfo,
    // The legacy demo assignment/exam pages still use literal Spring 2026
    // fixtures. Until those destinations share this adapter, the faithful
    // dashboard only promises class navigation—not stale deadline deep links.
    nextExamDate: "",
  }));
  const mastery = demoMastery(datedClasses, now);
  const agenda = buildDashboardAgenda(datedClasses, [], [], now)
    .filter((item): item is DemoClassAgendaItem => item.kind === "class");

  return {
    classes: datedClasses,
    recommendations: recommend({
      classes: datedClasses.map((classInfo) => ({
        id: classInfo.id,
        name: classInfo.name,
        currentReadiness: classInfo.readiness,
      })),
      assignments: [],
      exams: [],
      mastery,
      now,
    }),
    agenda,
    weakSpots: [
      { id: "math150:polynomial-division", name: "Polynomial long division", reason: "Needs another recall" },
      { id: "psych101:memory-models", name: "Memory models", reason: "Review is due" },
      { id: "bio200:meiosis", name: "Mitosis vs. meiosis", reason: "Confidence is still low" },
    ],
  };
}

function demoMastery(classes: ClassInfo[], now: Date): CoachInputMastery[] {
  return classes.flatMap((classInfo, classIndex) => [
    {
      concept_id: `${classInfo.id}:concept-1`,
      class_id: classInfo.id,
      strength: classIndex === 3 ? 0.24 : 0.42 + classIndex * 0.08,
      next_review_at: dateTimeAtOffset(now, classIndex % 2 === 0 ? -1 : 1),
      attempts: 2,
    },
    {
      concept_id: `${classInfo.id}:concept-2`,
      class_id: classInfo.id,
      strength: 0.56 + classIndex * 0.05,
      next_review_at: dateTimeAtOffset(now, 2 + classIndex),
      attempts: 3,
    },
  ]);
}

function dateAtOffset(now: Date, days: number) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function dateTimeAtOffset(now: Date, days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
