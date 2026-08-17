import { z } from "zod";
import { buildStableSyllabusItemKeys } from "./reconciliation";

export const SYLLABUS_BUCKET = "syllabus-sources";
export const MAX_SYLLABUS_BYTES = 15_000_000;
export const SYLLABUS_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const CLASS_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type ClassWeekday = (typeof CLASS_WEEKDAYS)[number];

const optionalText = (max: number) => z.string().trim().max(max).nullish()
  .transform((value) => value || undefined);
const looseDate = z.string().trim().max(40).nullish().transform((value) => value || "");

const parsedAssignmentSchema = z.object({
  label: z.string().trim().max(300),
  dueDate: looseDate,
}).passthrough();

const parsedExamSchema = z.object({
  label: z.string().trim().max(300),
  date: looseDate,
  topics: z.array(z.string().trim().max(200)).max(100).optional().default([]),
}).passthrough();

const parsedScheduleSchema = z.object({
  date: looseDate,
  topic: z.string().trim().max(500),
  dueItems: z.array(z.string().trim().max(300)).max(100).optional().default([]),
}).passthrough();

const parsedClassSchema = z.object({
  name: z.string().trim().max(300),
  code: optionalText(100),
  section: optionalText(100),
  professor: optionalText(300),
  days: z.array(z.string().trim().max(30)).max(7).optional().default([]),
  time: optionalText(40),
  endTime: optionalText(40),
  semesterStartDate: optionalText(40),
  semesterEndDate: optionalText(40),
  timeZone: optionalText(100),
  location: optionalText(300),
  textbook: optionalText(500),
  examDates: z.array(parsedExamSchema).max(200).optional().default([]),
  assignments: z.array(parsedAssignmentSchema).max(500).optional().default([]),
  schedule: z.array(parsedScheduleSchema).max(500).optional().default([]),
}).passthrough();

export const parsedSyllabusSchema = z.object({
  student: z.object({
    name: optionalText(300),
    school: optionalText(300),
    term: optionalText(120),
  }).passthrough().nullish(),
  classes: z.array(parsedClassSchema).min(1).max(30),
}).passthrough();

export interface ParsedSyllabusAssignment {
  label: string;
  dueDate?: string;
}
export interface ParsedSyllabusExam {
  label: string;
  date?: string;
  topics?: string[];
}
export interface ParsedSyllabusScheduleItem {
  date?: string;
  topic: string;
  dueItems?: string[];
}
export interface ParsedSyllabusClass {
  name: string;
  code?: string;
  section?: string;
  professor?: string;
  days?: string[];
  time?: string;
  endTime?: string;
  semesterStartDate?: string;
  semesterEndDate?: string;
  timeZone?: string;
  location?: string;
  textbook?: string;
  examDates?: ParsedSyllabusExam[];
  assignments?: ParsedSyllabusAssignment[];
  schedule?: ParsedSyllabusScheduleItem[];
  [key: string]: unknown;
}
export interface ParsedSyllabus {
  student?: { name?: string; school?: string; term?: string; [key: string]: unknown } | null;
  classes: ParsedSyllabusClass[];
  [key: string]: unknown;
}

export interface TargetClassContext {
  /** Durable public.classes UUID. */
  id: string;
  clientClassId: string;
  name: string;
  code?: string;
  term?: string;
  weekdays?: string[];
  days?: string[];
  startTime?: string;
  startTimeKey?: string;
  endTime?: string;
  endTimeKey?: string;
  semesterStartDate?: string;
  semesterEndDate?: string;
  schedule?: Array<{ date: string; topic: string; dueItems?: string[] }>;
}

export interface SyllabusReviewAssignment {
  key: string;
  included: boolean;
  title: string;
  dueDate: string;
}

export interface SyllabusReviewExam {
  key: string;
  included: boolean;
  title: string;
  examDate: string;
  topics: string[];
}

export interface SyllabusReviewScheduleItem {
  key: string;
  included: boolean;
  date: string;
  topic: string;
  dueItems: string[];
}

export interface SyllabusReviewDraft {
  selectedClassIndex: number;
  sourceClassName: string;
  sourceClassCode: string;
  class: {
    weekdays: ClassWeekday[];
    startTime: string;
    endTime: string;
    term: string;
    semesterStartDate: string;
    semesterEndDate: string;
  };
  assignments: SyllabusReviewAssignment[];
  exams: SyllabusReviewExam[];
  schedule: SyllabusReviewScheduleItem[];
}

const optionalTime = z.string().refine((value) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), {
  message: "Use a 24-hour time in HH:MM format",
});
const stableKey = z.string().regex(/^[a-z]+:[0-9a-f]{8}:[0-9]+$/, "Invalid syllabus item identity");

export const syllabusReviewDraftSchema = z.object({
  selectedClassIndex: z.number().int().min(0).max(29),
  sourceClassName: z.string().trim().max(300),
  sourceClassCode: z.string().trim().max(100),
  class: z.object({
    weekdays: z.array(z.enum(CLASS_WEEKDAYS)).max(7),
    startTime: optionalTime,
    endTime: optionalTime,
    term: z.string().trim().max(120),
    semesterStartDate: z.string().refine((value) => value === "" || isValidIsoDate(value), "Use a real date in YYYY-MM-DD format"),
    semesterEndDate: z.string().refine((value) => value === "" || isValidIsoDate(value), "Use a real date in YYYY-MM-DD format"),
  }).superRefine((value, context) => {
    if (value.endTime && !value.startTime) {
      context.addIssue({ code: "custom", path: ["startTime"], message: "Start time is required when an end time is set" });
    }
    if ((value.startTime || value.endTime) && value.weekdays.length === 0) {
      context.addIssue({ code: "custom", path: ["weekdays"], message: "Choose at least one meeting day when a time is set" });
    }
    if (value.weekdays.length > 0 && !value.startTime) {
      context.addIssue({ code: "custom", path: ["startTime"], message: "Start time is required for recurring class days" });
    }
    if (value.weekdays.length > 0 && (!value.semesterStartDate || !value.semesterEndDate)) {
      context.addIssue({
        code: "custom",
        path: [value.semesterStartDate ? "semesterEndDate" : "semesterStartDate"],
        message: "Term start and end dates are required for recurring class days",
      });
    }
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
      context.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
    }
    if (value.semesterStartDate && value.semesterEndDate && value.semesterStartDate > value.semesterEndDate) {
      context.addIssue({ code: "custom", path: ["semesterEndDate"], message: "Term end must be on or after its start" });
    }
  }),
  assignments: z.array(z.object({
    key: stableKey,
    included: z.boolean(),
    title: z.string().trim().max(300),
    dueDate: z.string().trim().max(40),
  }).superRefine((value, context) => {
    if (!value.included) return;
    if (!value.title) context.addIssue({ code: "custom", path: ["title"], message: "Title is required" });
    if (!isValidIsoDate(value.dueDate)) context.addIssue({ code: "custom", path: ["dueDate"], message: "Choose a real due date" });
  })).max(500),
  exams: z.array(z.object({
    key: stableKey,
    included: z.boolean(),
    title: z.string().trim().max(300),
    examDate: z.string().trim().max(40),
    topics: z.array(z.string().trim().max(200)).max(100),
  }).superRefine((value, context) => {
    if (!value.included) return;
    if (!value.title) context.addIssue({ code: "custom", path: ["title"], message: "Title is required" });
    if (!isValidIsoDate(value.examDate)) context.addIssue({ code: "custom", path: ["examDate"], message: "Choose a real exam date" });
  })).max(200),
  schedule: z.array(z.object({
    key: stableKey,
    included: z.boolean(),
    date: z.string().trim().max(40),
    topic: z.string().trim().max(500),
    dueItems: z.array(z.string().trim().max(300)).max(100),
  }).superRefine((value, context) => {
    if (!value.included) return;
    if (!value.topic) context.addIssue({ code: "custom", path: ["topic"], message: "Topic is required" });
    if (!isValidIsoDate(value.date)) context.addIssue({ code: "custom", path: ["date"], message: "Choose a real schedule date" });
  })).max(500),
});

export function parseParsedSyllabus(value: unknown): ParsedSyllabus {
  return parsedSyllabusSchema.parse(value) as ParsedSyllabus;
}

export function validateSyllabusReviewDraft(value: unknown): SyllabusReviewDraft {
  const parsed = syllabusReviewDraftSchema.parse(value) as SyllabusReviewDraft;
  assertUniqueKeys([...parsed.assignments, ...parsed.exams, ...parsed.schedule].map((item) => item.key));
  return parsed;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeWeekdays(values: readonly string[]): ClassWeekday[] {
  const aliases: Record<string, ClassWeekday> = {
    m: "Mon", t: "Tue", w: "Wed", r: "Thu", f: "Fri",
    mon: "Mon", monday: "Mon", tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed", thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri", sat: "Sat", saturday: "Sat", sun: "Sun", sunday: "Sun",
  };
  const selected = new Set(values.flatMap((value) => {
    const normalized = value.trim().toLowerCase();
    const direct = aliases[normalized];
    if (direct) return [direct];
    return normalized.split(/[/,;&+]+|\s+(?=(?:mon|tue|wed|thu|fri|sat|sun))/)
      .flatMap((part) => aliases[part.trim()] ?? []);
  }));
  return CLASS_WEEKDAYS.filter((day) => selected.has(day));
}

export function normalizeTime(value: string | undefined): string {
  const input = value?.trim();
  if (!input) return "";
  const twentyFourHour = input.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
  if (twentyFourHour) return `${twentyFourHour[1].padStart(2, "0")}:${twentyFourHour[2]}`;
  const twelveHour = input.match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*([ap])\.?m\.?$/i);
  if (!twelveHour) return input;
  let hour = Number(twelveHour[1]) % 12;
  if (twelveHour[3].toLowerCase() === "p") hour += 12;
  return `${String(hour).padStart(2, "0")}:${twelveHour[2]}`;
}

function assertUniqueKeys(keys: string[]) {
  if (new Set(keys).size !== keys.length) throw new Error("Syllabus item identities must be unique");
}

export function createSyllabusReviewDraft(
  parsed: ParsedSyllabus,
  selectedClassIndex = 0,
  targetClass?: Partial<TargetClassContext>,
): SyllabusReviewDraft {
  const source = parsed.classes[selectedClassIndex];
  if (!source) throw new Error("Choose a class found in the syllabus");
  const sourceSchedule = source.schedule ?? [];
  const parsedDays = normalizeWeekdays(source.days ?? []);
  const fallbackDays = normalizeWeekdays(targetClass?.weekdays ?? targetClass?.days ?? []);
  return {
    selectedClassIndex,
    sourceClassName: source.name,
    sourceClassCode: source.code ?? "",
    class: {
      weekdays: parsedDays.length ? parsedDays : fallbackDays,
      startTime: normalizeTime(source.time) || normalizeTime(targetClass?.startTimeKey ?? targetClass?.startTime),
      endTime: normalizeTime(source.endTime) || normalizeTime(targetClass?.endTimeKey ?? targetClass?.endTime),
      term: parsed.student?.term ?? targetClass?.term ?? "",
      semesterStartDate: source.semesterStartDate ?? targetClass?.semesterStartDate ?? "",
      semesterEndDate: source.semesterEndDate ?? targetClass?.semesterEndDate ?? "",
    },
    assignments: buildStableSyllabusItemKeys("assignment", source.assignments ?? [], (item) => item.label)
      .map(({ item, key }) => ({ key, included: true, title: item.label, dueDate: item.dueDate ?? "" })),
    exams: buildStableSyllabusItemKeys("exam", source.examDates ?? [], (item) => item.label)
      .map(({ item, key }) => ({ key, included: true, title: item.label, examDate: item.date ?? "", topics: item.topics ?? [] })),
    schedule: buildStableSyllabusItemKeys("schedule", sourceSchedule, (item) => item.topic)
      .map(({ item, key }) => ({
        key,
        included: true,
        date: item.date ?? "",
        topic: item.topic,
        dueItems: item.dueItems ?? [],
      })),
  };
}
