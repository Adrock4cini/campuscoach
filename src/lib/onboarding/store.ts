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

const ONBOARDED_KEY = "cc_onboarded_real_v1";
const DEMO_MODE_KEY = "cc_demo_mode_v1";
const CACHE_KEY = "cc_onboarding_cache_v1";

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
  localStorage.removeItem(CACHE_KEY);
}

export function loadCachedOnboarding(): OnboardingData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as OnboardingData) : null;
  } catch {
    return null;
  }
}

export async function saveOnboarding(data: OnboardingData): Promise<void> {
  const userId = getAnonUserId();
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));

  // school (dedupe by lowercase name)
  let schoolId: string | null = null;
  const schoolName = data.school.trim();
  if (schoolName) {
    try {
      const { data: found } = await supabase
        .from("schools")
        .select("id")
        .ilike("name", schoolName)
        .maybeSingle();
      if (found?.id) {
        schoolId = found.id;
      } else {
        const { data: created } = await supabase
          .from("schools")
          .insert({ name: schoolName })
          .select("id")
          .single();
        schoolId = created?.id ?? null;
      }
    } catch (e) {
      console.warn("[onboarding] school upsert failed", e);
    }
  }

  // profile
  try {
    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        display_name: data.name || null,
        learner_type: data.learnerType || null,
        term: data.term || null,
        school_id: schoolId,
        work_schedule: data.workSchedule || null,
        encouragement_tone: "warm",
        default_study_length: 25,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch (e) {
    console.warn("[onboarding] profile upsert failed", e);
  }

  // classes + enrollments
  for (const c of data.classes) {
    if (!c.name.trim()) continue;
    const clientClassId = `u-${userId.slice(0, 8)}-${slugify(c.name)}`;
    try {
      const { data: inserted, error } = await supabase
        .from("classes")
        .upsert(
          {
            user_id: userId,
            client_class_id: clientClassId,
            name: c.name,
            professor: c.professor || null,
            location: c.location || null,
            color: "bg-primary",
            current_topic: null,
            meta: ({
              days: c.days,
              time: c.time || null,
              endTime: c.endTime || null,
              code: c.code || null,
              textbook: c.textbook || null,
              examDates: c.examDates ?? [],
              assignments: c.assignments ?? [],
              term: data.term,
              school: schoolName || null,
              schoolId,
              work_schedule: data.workSchedule || null,
              reminder_style: data.reminderStyle,
              study_goal: data.studyGoal,
            } as never),

          },
          { onConflict: "client_class_id" }
        )
        .select("id")
        .single();
      if (error) throw error;
      if (inserted?.id) {
        await supabase
          .from("enrollments")
          .upsert(
            { user_id: userId, class_id: inserted.id, role: "student" },
            { onConflict: "user_id,class_id" }
          );
      }
    } catch (e) {
      console.warn("[onboarding] class upsert failed", c.name, e);
    }
  }

  localStorage.setItem(ONBOARDED_KEY, "1");
  localStorage.removeItem(DEMO_MODE_KEY);
}


function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
