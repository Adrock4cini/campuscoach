/**
 * Onboarding store — local flags + Supabase persistence.
 *
 * Auth-ready: we scope every row to `getAnonUserId()`, which is a
 * stable per-browser uuid. When real Supabase auth ships, swap this
 * for `auth.uid()` and the shape stays the same.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAnonUserId } from "@/hooks/useClassIntelligence";
import type { OnboardingData } from "./types";
import { canonicalizeSchoolName } from "./options";
import { buildSyllabusDeadlineRows } from "./syllabusDeadlines";
import { browserTimeZone, normalizeTimeKey, normalizeWeekdays } from "@/lib/calendar/classSchedule";
import { matchExistingClass, type ExistingClassIdentity } from "./onboardingEntry";


const ONBOARDED_KEY = "cc_onboarded_real_v1";
const DEMO_MODE_KEY = "cc_demo_mode_v1";
const CACHE_KEY = "cc_onboarding_cache_v1";

function onboardingCacheKey(userId?: string) {
  return userId ? `${CACHE_KEY}:${userId}` : CACHE_KEY;
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DEMO_MODE_KEY) === "1";
}

export function markDemoMode() {
  localStorage.setItem(DEMO_MODE_KEY, "1");
}

export function clearOnboarding() {
  localStorage.removeItem(ONBOARDED_KEY);
  localStorage.removeItem(DEMO_MODE_KEY);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key === CACHE_KEY || key?.startsWith(`${CACHE_KEY}:`)) localStorage.removeItem(key);
  }
}

export function loadCachedOnboarding(userId?: string): OnboardingData | null {
  try {
    const raw = localStorage.getItem(onboardingCacheKey(userId));
    return raw ? (JSON.parse(raw) as OnboardingData) : null;
  } catch {
    return null;
  }
}

export function cacheOnboardingDraft(data: OnboardingData, userId: string): void {
  if (!userId) return;
  localStorage.setItem(onboardingCacheKey(userId), JSON.stringify(data));
}

export async function saveOnboarding(data: OnboardingData, explicitUserId?: string): Promise<void> {
  const userId = explicitUserId || getAnonUserId();
  const cacheKey = onboardingCacheKey(userId);
  cacheOnboardingDraft(data, userId);

  // school (dedupe by lowercase name)
  let schoolId: string | null = null;
  const schoolName = canonicalizeSchoolName(data.school);
  if (schoolName) {
    const { data: found, error: schoolLookupError } = await supabase
      .from("schools")
      .select("id")
      .ilike("name", schoolName)
      .limit(1)
      .maybeSingle();
    if (schoolLookupError) throw schoolLookupError;
    if (found?.id) {
      schoolId = found.id;
    } else {
      const { data: created, error: schoolCreateError } = await supabase
        .from("schools")
        .insert({ name: schoolName })
        .select("id")
        .single();
      if (schoolCreateError) throw schoolCreateError;
      schoolId = created?.id ?? null;
    }
  }

  // Save profile details first, but do not mark onboarding complete until every
  // class and enrollment has been written successfully.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      display_name: data.name || null,
      learner_type: data.learnerType || null,
      term: data.term || null,
      school_id: schoolId,
      work_schedule: data.workSchedule || null,
      encouragement_tone: "warm",
      default_study_length: 25,
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;

  // classes + enrollments
  // An interrupted setup that is retried must reuse the rows it already wrote.
  // Without this, a fresh draft generates new client ids and silently
  // duplicates every class.
  const { data: existingClasses, error: existingClassesError } = await supabase
    .from("classes")
    .select("id, client_class_id, name, term, section")
    .eq("user_id", userId);
  if (existingClassesError) throw existingClassesError;
  const existing = (existingClasses ?? []) as ExistingClassIdentity[];

  for (const c of data.classes) {
    if (!c.name.trim()) continue;
    const alreadySaved = matchExistingClass(existing, {
      name: c.name,
      term: data.term || null,
      section: c.section || null,
    });
    // New onboarding drafts always carry a random UUID. The legacy fallback
    // only keeps older cached drafts retry-safe during the rollout.
    const clientClassId = alreadySaved?.client_class_id
      || c.clientClassId
      || `u-${userId.slice(0, 8)}-${slugify(c.name)}`;
    const rowId = alreadySaved?.id ?? (isUuid(clientClassId) ? clientClassId : undefined);
    const weekdays = normalizeWeekdays(c.days);
    const startTime = normalizeTimeKey(c.time);
    const endTime = normalizeTimeKey(c.endTime);
    const { data: inserted, error } = await supabase
      .from("classes")
      .upsert(

          {
            ...(rowId ? { id: rowId } : {}),
            user_id: userId,
            client_class_id: clientClassId,
            name: c.name,
            professor: c.professor || null,
            location: c.location || null,
            term: data.term || null,
            section: c.section || null,
            semester_start_date: c.semesterStartDate || null,
            semester_end_date: c.semesterEndDate || null,
            weekdays,
            start_time: startTime || null,
            end_time: endTime || null,
            time_zone: c.timeZone || browserTimeZone(),
            color: "bg-primary",
            current_topic: null,
            meta: ({
              days: weekdays,
              time: startTime || null,
              endTime: endTime || null,
              code: c.code || null,
              section: c.section || null,
              textbook: c.textbook || null,
              examDates: c.examDates ?? [],
              assignments: c.assignments ?? [],
              schedule: c.schedule ?? [],
              term: data.term,
              semesterStartDate: c.semesterStartDate || null,
              semesterEndDate: c.semesterEndDate || null,
              timeZone: c.timeZone || browserTimeZone(),
              school: schoolName || null,
              schoolId,
              work_schedule: data.workSchedule || null,
              reminder_style: data.reminderStyle,
              study_goal: data.studyGoal,
            } as never),

          },
          { onConflict: rowId ? "id" : "client_class_id" }
      )
      .select("id")
      .single();
    if (error) throw error;
    if (inserted?.id) {
      const { error: enrollmentError } = await supabase
        .from("enrollments")
        .upsert(
          { user_id: userId, class_id: inserted.id, role: "student" },
          { onConflict: "user_id,class_id" }
        );
      if (enrollmentError) throw enrollmentError;

      const deadlineRows = buildSyllabusDeadlineRows(c, {
        userId,
        classUuid: inserted.id,
        clientClassId,
      });
      await saveSyllabusDeadlines(deadlineRows);
    }
  }

  const { error: completionError } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (completionError) throw completionError;

  localStorage.setItem(ONBOARDED_KEY, "1");
  localStorage.removeItem(DEMO_MODE_KEY);
  localStorage.removeItem(cacheKey);
}

export async function saveSyllabusDeadlines(
  rows: ReturnType<typeof buildSyllabusDeadlineRows>,
) {
  // Onboarding can be retried after a network interruption. Check the natural
  // class/title/date identity before each insert so a retry does not duplicate
  // syllabus deadlines that were already saved.
  for (const row of rows.assignments) {
    const { data: existing, error: lookupError } = await supabase
      .from("assignments")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("client_class_id", row.client_class_id)
      .eq("title", row.title)
      .eq("due_date", row.due_date)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) continue;

    const { error: insertError } = await supabase.from("assignments").insert(row);
    if (insertError) throw insertError;
  }

  for (const row of rows.exams) {
    const { data: existing, error: lookupError } = await supabase
      .from("exams")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("client_class_id", row.client_class_id)
      .eq("title", row.title)
      .eq("exam_date", row.exam_date)
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) continue;

    const { error: insertError } = await supabase.from("exams").insert(row);
    if (insertError) throw insertError;
  }
}


function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
