/**
 * useMyClasses — returns the current student's classes in the
 * `ClassInfo` shape the app already uses.
 *
 * Behavior:
 *   - Signed-in user: reads from Supabase (RLS scoped to `auth.uid()`).
 *     Reloads on auth state change.
 *   - Signed-out / demo mode: returns demo classes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classes as demoClasses, type ClassInfo } from "@/data/demo";
import { useAuth } from "@/contexts/AuthContext";
import { formatTimeKey, normalizeTimeKey, normalizeWeekdays } from "@/lib/calendar/classSchedule";

interface ReadinessSnapshot {
  class_id: string | null;
  client_class_id: string | null;
  readiness: number;
  computed_at: string;
}

export function resolveLatestReadiness(
  classUuid: string,
  clientClassId: string,
  fallback: number,
  snapshots: ReadinessSnapshot[],
) {
  // Prefer the durable class UUID. Older snapshots may only have the client
  // ID, so use those only when no UUID-linked history exists.
  const exact = snapshots.filter((row) => row.class_id === classUuid);
  const legacy = snapshots.filter((row) => (
    !row.class_id && row.client_class_id === clientClassId
  ));
  const candidates = exact.length ? exact : legacy;
  const latest = candidates.reduce<ReadinessSnapshot | null>((current, row) => (
    !current || Date.parse(row.computed_at) > Date.parse(current.computed_at)
      ? row
      : current
  ), null);
  return latest ? latest.readiness : fallback;
}

interface MyClassesState {
  classes: ClassInfo[];
  isReal: boolean;
  loading: boolean;
  error: string | null;
  ownerKey: string;
}

export function useMyClasses(): MyClassesState & { reload: () => Promise<void> } {
  const { user, mode } = useAuth();
  const userId = user?.id;
  const realMode = mode === "real";
  const expectedOwnerKey = mode === "real" ? `real:${userId ?? "none"}` : mode;
  const requestVersion = useRef(0);
  const [state, setState] = useState<MyClassesState>(() => ({
    // Signed-in real users NEVER see demo classes — start empty while loading.
    classes: mode === "demo" ? demoClasses : [],
    isReal: realMode,
    loading: mode !== "demo",
    error: null,
    ownerKey: expectedOwnerKey,
  }));

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    if (mode === "loading") {
      setState({ classes: [], isReal: false, loading: true, error: null, ownerKey: "loading" });
      return;
    }
    if (mode === "demo") {
      setState({ classes: demoClasses, isReal: false, loading: false, error: null, ownerKey: "demo" });
      return;
    }
    if (!userId) {
      setState({ classes: [], isReal: false, loading: false, error: null, ownerKey: "real:none" });
      return;
    }

    const ownerKey = `real:${userId}`;
    setState((current) => ({
      classes: current.ownerKey === ownerKey ? current.classes : [],
      isReal: true,
      loading: true,
      error: null,
      ownerKey,
    }));
    try {
      const [classResult, readinessResult] = await Promise.all([
        supabase
          .from("classes")
          .select("id, client_class_id, name, professor, location, color, current_topic, readiness, meta, source, term, section, semester_start_date, semester_end_date, weekdays, start_time, end_time, time_zone")
          .eq("user_id", userId)
          .is("source_archived_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("readiness_scores")
          .select("class_id, client_class_id, readiness, computed_at")
          .eq("user_id", userId),
      ]);
      if (classResult.error) throw classResult.error;
      if (request !== requestVersion.current) return;
      if (readinessResult.error) {
        console.warn("[useMyClasses] readiness history load failed; using class fallback", readinessResult.error);
      }
      const data = classResult.data;
      if (!data || data.length === 0) {
        // Real signed-in user with no classes yet — return empty (real mode).
        setState({ classes: [], isReal: true, loading: false, error: null, ownerKey });
        return;
      }
      const readinessRows = (readinessResult.data ?? []) as ReadinessSnapshot[];
      const mapped: ClassInfo[] = data.map((row, i) => {
        const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? row.meta as Record<string, unknown>
          : {} as Record<string, unknown>;
        const legacyDays = Array.isArray(meta.days)
          ? meta.days.filter((day): day is string => typeof day === "string")
          : [];
        const days = normalizeWeekdays(row.weekdays?.length ? row.weekdays : legacyDays);
        const startTime = normalizeTimeKey(row.start_time || (typeof meta.time === "string" ? meta.time : ""));
        const endTime = normalizeTimeKey(row.end_time || (typeof meta.endTime === "string" ? meta.endTime : ""));
        const syllabusMeta = meta.syllabus && typeof meta.syllabus === "object" && !Array.isArray(meta.syllabus)
          ? meta.syllabus as Record<string, unknown>
          : null;
        const activeSyllabusId = typeof syllabusMeta?.activeSyllabusId === "string"
          ? syllabusMeta.activeSyllabusId
          : "";
        return {
          uuid: row.id,
          id: row.client_class_id,
          name: row.name,
          professor: row.professor || "TBD",
          location: row.location || "",
          days,
          time: formatTimeKey(startTime),
          endTime: formatTimeKey(endTime),
          startTimeKey: startTime,
          endTimeKey: endTime,
          color: row.color || palette[i % palette.length],
          currentTopic: row.current_topic || "",
          nextExamDate: "",
          readiness: resolveLatestReadiness(
            row.id,
            row.client_class_id || row.id,
            row.readiness ?? 0,
            readinessRows,
          ),
          suggestedAction: "Add your first capture for this class",
          gradingWeights: [],
          chapters: [],
          courseCode: typeof meta.code === "string" ? meta.code : "",
          section: row.section || (typeof meta.section === "string" ? meta.section : ""),
          term: row.term || (typeof meta.term === "string" ? meta.term : ""),
          semesterStartDate: row.semester_start_date || (typeof meta.semesterStartDate === "string" ? meta.semesterStartDate : ""),
          semesterEndDate: row.semester_end_date || (typeof meta.semesterEndDate === "string" ? meta.semesterEndDate : ""),
          timeZone: row.time_zone || (typeof meta.timeZone === "string" ? meta.timeZone : ""),
          source: row.source,
          hasSyllabus: Boolean(activeSyllabusId),
          syllabusRevision: typeof syllabusMeta?.revision === "number" ? syllabusMeta.revision : undefined,
          syllabusReviewedAt: typeof syllabusMeta?.reviewedAt === "string" ? syllabusMeta.reviewedAt : undefined,
          schedule: Array.isArray(meta.schedule)
            ? meta.schedule.flatMap((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item)) return [];
                const row = item as Record<string, unknown>;
                if (typeof row.date !== "string" || typeof row.topic !== "string") return [];
                return [{
                  date: row.date,
                  topic: row.topic,
                  dueItems: Array.isArray(row.dueItems)
                    ? row.dueItems.filter((value): value is string => typeof value === "string")
                    : [],
                }];
              })
            : [],
        };
      });
      setState({ classes: mapped, isReal: true, loading: false, error: null, ownerKey });
    } catch (e) {
      if (request !== requestVersion.current) return;
      console.warn("[useMyClasses] load failed; preserving an explicit error state", e);
      setState((current) => ({
        classes: current.classes,
        isReal: true,
        loading: false,
        error: "Couldn’t load your classes. Your saved classes were not deleted.",
        ownerKey,
      }));
    }
  }, [mode, userId]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("coach:refresh", handler);
    return () => window.removeEventListener("coach:refresh", handler);
  }, [load]);

  // Effects run after render. Gate the returned data synchronously so an
  // account switch can never render the previous student's class names while
  // the new request is starting.
  const visibleState = state.ownerKey === expectedOwnerKey
    ? state
    : {
        classes: [],
        isReal: realMode,
        loading: mode === "loading" || realMode,
        error: null,
        ownerKey: expectedOwnerKey,
      };

  return { ...visibleState, reload: load };
}

const palette = ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-danger"];
