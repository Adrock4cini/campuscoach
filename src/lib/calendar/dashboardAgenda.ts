import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { toDateKey } from "./dateKey";

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

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateFromKey(key: string, endOfDay = false) {
  const date = new Date(`${key}T${endOfDay ? "23:59:59" : "12:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateWithClassTime(key: string, time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  const date = dateFromKey(key);
  if (!date || !match) return date;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;
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
  const dated = (item.schedule ?? [])
    .flatMap((entry) => {
      const candidate = dateWithClassTime(entry.date, item.time);
      return candidate && candidate >= now ? [{ date: candidate, topic: entry.topic }] : [];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

  let recurring: { date: Date; topic?: string } | undefined;
  const normalizedDays = new Set(item.days.map((day) => day.trim().slice(0, 3).toLowerCase()));
  if (normalizedDays.size) {
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      const day = DAY_LABELS[date.getDay()];
      if (!normalizedDays.has(day)) continue;
      const candidate = dateWithClassTime(toDateKey(date), item.time);
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
