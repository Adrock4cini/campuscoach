import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { parseDateKey, toDateKey } from "./dateKey";
import { isDateWithinTerm, normalizeTimeKey, weekdayForDate } from "./classSchedule";

export type DashboardAgendaItem =
  | {
      kind: "class";
      id: string;
      classId: string;
      className: string;
      title: string;
      at: Date;
      meta: string;
    }
  | {
      kind: "assignment";
      id: string;
      classId: string;
      className: string;
      title: string;
      at: Date;
      meta: string;
    }
  | {
      kind: "exam";
      id: string;
      classId: string;
      className: string;
      title: string;
      at: Date;
      meta: string;
      readiness: number;
    };

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateFromKey(key: string, endOfDay = false) {
  const date = parseDateKey(key);
  if (!date) return null;
  date.setHours(endOfDay ? 23 : 12, endOfDay ? 59 : 0, endOfDay ? 59 : 0, 0);
  return date;
}

function dateWithClassTime(key: string, time: string) {
  const normalized = normalizeTimeKey(time);
  const date = dateFromKey(key);
  if (!date || !normalized) return date;
  const [hour, minute] = normalized.split(":").map(Number);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function relativeDay(date: Date, now: Date) {
  const distance = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (distance < 0) return `${Math.abs(distance)}d overdue`;
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function nextClassDate(item: ClassInfo, now: Date) {
  const calculationTime = item.startTimeKey || item.time;
  const dated = (item.schedule ?? [])
    .flatMap((entry) => {
      const candidate = dateWithClassTime(entry.date, calculationTime);
      return candidate && candidate >= now ? [{ date: candidate, topic: entry.topic }] : [];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  let recurring: { date: Date; topic?: string } | undefined;
  const normalizedDays = new Set(item.days);
  if (normalizedDays.size) {
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      const dateKey = toDateKey(date);
      if (!isDateWithinTerm(dateKey, item.semesterStartDate, item.semesterEndDate)) continue;
      if (!normalizedDays.has(weekdayForDate(date))) continue;
      const candidate = dateWithClassTime(dateKey, calculationTime);
      if (candidate && candidate >= now) {
        recurring = { date: candidate };
        break;
      }
    }
  }

  if (!dated) return recurring;
  if (!recurring || dated.date <= recurring.date) return dated;
  return recurring;
}

export function buildDashboardAgenda(
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
  now = new Date(),
) {
  const today = startOfDay(now);
  const classNameFor = (classId: string | null) => (
    classes.find((item) => item.id === classId)?.name ?? "Class"
  );

  const classItems: DashboardAgendaItem[] = classes.flatMap((item) => {
    const next = nextClassDate(item, now);
    if (!next) return [];
    const day = relativeDay(next.date, now);
    const time = item.time || "Class meeting";
    return [{
      kind: "class" as const,
      id: `class-${item.id}-${toDateKey(next.date)}`,
      classId: item.id,
      className: item.name,
      title: next.topic ? `${item.name}: ${next.topic}` : `${item.name} class`,
      at: next.date,
      meta: `${day} · ${time}`,
    }];
  });

  const assignmentItems: DashboardAgendaItem[] = assignments.flatMap((item) => {
    if (item.status === "complete" || !item.due_date) return [];
    const date = dateFromKey(item.due_date, true);
    if (!date) return [];
    return [{
      kind: "assignment" as const,
      id: item.id,
      classId: item.client_class_id ?? "",
      className: classNameFor(item.client_class_id),
      title: item.title,
      at: date,
      meta: date < today ? relativeDay(date, now) : `Due ${relativeDay(date, now).toLowerCase()}`,
    }];
  });

  const examItems: DashboardAgendaItem[] = exams.flatMap((item) => {
    if (!item.exam_date) return [];
    const date = dateFromKey(item.exam_date);
    if (!date || date < today) return [];
    return [{
      kind: "exam" as const,
      id: item.id,
      classId: item.client_class_id ?? "",
      className: classNameFor(item.client_class_id),
      title: item.title,
      at: date,
      meta: relativeDay(date, now),
      readiness: item.readiness,
    }];
  });

  return [...classItems, ...assignmentItems, ...examItems]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 4);
}
