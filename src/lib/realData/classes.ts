import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  WEEKDAYS,
  browserTimeZone,
  normalizeTimeKey,
  normalizeWeekdays,
  type Weekday,
} from "@/lib/calendar/classSchedule";

const optionalText = (max: number) => z.string().trim().max(max);

export const classEditorSchema = z.object({
  name: z.string().trim().min(1, "Enter a class name").max(120, "Keep the class name under 120 characters"),
  code: optionalText(40),
  section: optionalText(40),
  professor: optionalText(120),
  location: optionalText(160),
  term: z.string().trim().min(1, "Choose a term").max(60),
  weekdays: z.array(z.enum(WEEKDAYS)),
  startTime: z.string(),
  endTime: z.string(),
  semesterStartDate: z.string(),
  semesterEndDate: z.string(),
  timeZone: z.string().trim().min(1),
}).superRefine((value, context) => {
  const hasStartDate = Boolean(value.semesterStartDate);
  const hasEndDate = Boolean(value.semesterEndDate);
  if (hasStartDate !== hasEndDate) {
    const path = hasStartDate ? "semesterEndDate" : "semesterStartDate";
    context.addIssue({
      code: "custom",
      path: [path],
      message: hasStartDate ? "Choose the last day of the term" : "Choose the first day of the term",
    });
  }
  if (
    value.semesterStartDate &&
    value.semesterEndDate &&
    value.semesterEndDate < value.semesterStartDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["semesterEndDate"],
      message: "The term must end after it starts",
    });
  }
  if (value.weekdays.length > 0 && (!hasStartDate || !hasEndDate)) {
    context.addIssue({
      code: "custom",
      path: [hasStartDate ? "semesterEndDate" : "semesterStartDate"],
      message: "Choose term dates so meetings stop when the term ends",
    });
  }

  const startTime = normalizeTimeKey(value.startTime);
  const endTime = normalizeTimeKey(value.endTime);
  if ((startTime || endTime) && value.weekdays.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["weekdays"],
      message: "Choose at least one class day when adding a meeting time",
    });
  }
  if (value.startTime && !startTime) {
    context.addIssue({ code: "custom", path: ["startTime"], message: "Choose a valid start time" });
  }
  if (value.endTime && !endTime) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "Choose a valid end time" });
  }
  if (endTime && !startTime) {
    context.addIssue({ code: "custom", path: ["startTime"], message: "Choose when class starts" });
  }
  if (startTime && endTime && endTime <= startTime) {
    context.addIssue({ code: "custom", path: ["endTime"], message: "Class must end after it starts" });
  }
});

export type ClassEditorValues = z.infer<typeof classEditorSchema>;

export interface SavedClassIdentity {
  uuid: string;
  clientClassId: string;
}

export function emptyClassEditorValues(term = ""): ClassEditorValues {
  return {
    name: "",
    code: "",
    section: "",
    professor: "",
    location: "",
    term,
    weekdays: [],
    startTime: "",
    endTime: "",
    semesterStartDate: "",
    semesterEndDate: "",
    timeZone: browserTimeZone(),
  };
}

export function createStableClassId() {
  return crypto.randomUUID();
}

function asMetaRecord(value: unknown): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, Json | undefined>) };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizedValues(input: ClassEditorValues): ClassEditorValues {
  const parsed = classEditorSchema.parse(input);
  return {
    ...parsed,
    weekdays: normalizeWeekdays(parsed.weekdays),
    startTime: normalizeTimeKey(parsed.startTime),
    endTime: normalizeTimeKey(parsed.endTime),
  };
}

function classWritePayload(input: ClassEditorValues, existingMeta?: unknown) {
  const value = normalizedValues(input);
  const weekdays = normalizeWeekdays(value.weekdays);
  const meta = {
    ...asMetaRecord(existingMeta),
    code: nullable(value.code),
    section: nullable(value.section),
    days: weekdays,
    time: nullable(value.startTime),
    endTime: nullable(value.endTime),
    term: value.term,
    semesterStartDate: nullable(value.semesterStartDate),
    semesterEndDate: nullable(value.semesterEndDate),
    timeZone: value.timeZone,
  } satisfies Record<string, Json | undefined>;

  return {
    name: value.name,
    professor: nullable(value.professor),
    location: nullable(value.location),
    term: value.term,
    section: nullable(value.section),
    semester_start_date: nullable(value.semesterStartDate),
    semester_end_date: nullable(value.semesterEndDate),
    weekdays,
    start_time: nullable(value.startTime),
    end_time: nullable(value.endTime),
    time_zone: value.timeZone,
    meta: meta as Json,
  };
}

export async function createClass(
  userId: string,
  stableId: string,
  input: ClassEditorValues,
): Promise<SavedClassIdentity> {
  const payload = classWritePayload(input);
  const { data, error } = await supabase
    .from("classes")
    .upsert({
      id: stableId,
      user_id: userId,
      client_class_id: stableId,
      color: colorForId(stableId),
      current_topic: null,
      readiness: 0,
      source: "manual",
      ...payload,
    }, { onConflict: "id" })
    .select("id, client_class_id")
    .single();
  if (error) throw error;

  const { error: enrollmentError } = await supabase
    .from("enrollments")
    .upsert(
      { user_id: userId, class_id: data.id, role: "student" },
      { onConflict: "user_id,class_id" },
    );
  if (enrollmentError) throw enrollmentError;

  return { uuid: data.id, clientClassId: data.client_class_id };
}

export async function updateClass(
  userId: string,
  classUuid: string,
  input: ClassEditorValues,
): Promise<SavedClassIdentity> {
  const { data: existing, error: lookupError } = await supabase
    .from("classes")
    .select("id, client_class_id, meta")
    .eq("id", classUuid)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error("Class not found");

  const payload = classWritePayload(input, existing.meta);
  const { data, error } = await supabase
    .from("classes")
    .update(payload)
    .eq("id", classUuid)
    .eq("user_id", userId)
    .select("id, client_class_id")
    .single();
  if (error) throw error;
  return { uuid: data.id, clientClassId: data.client_class_id };
}

function colorForId(value: string) {
  const colors = ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-danger"];
  const hash = Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export type { Weekday };
