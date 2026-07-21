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

export function useMyClasses(): { classes: ClassInfo[]; isReal: boolean; loading: boolean } {
  const { user, mode } = useAuth();
  const realMode = mode === "real";
  const requestVersion = useRef(0);
  const [state, setState] = useState<{ classes: ClassInfo[]; isReal: boolean; loading: boolean }>(() => ({
    // Signed-in real users NEVER see demo classes — start empty while loading.
    classes: mode === "demo" ? demoClasses : [],
    isReal: realMode,
    loading: mode !== "demo",
  }));

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    if (mode === "loading") {
      setState({ classes: [], isReal: false, loading: true });
      return;
    }
    if (mode === "demo") {
      setState({ classes: demoClasses, isReal: false, loading: false });
      return;
    }
    if (!user) {
      setState({ classes: [], isReal: false, loading: false });
      return;
    }

    setState((current) => ({ ...current, isReal: true, loading: true }));
    try {
      const [classResult, readinessResult] = await Promise.all([
        supabase
          .from("classes")
          .select("id, client_class_id, name, professor, location, color, current_topic, readiness, meta")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("readiness_scores")
          .select("class_id, client_class_id, readiness, computed_at")
          .eq("user_id", user.id),
      ]);
      if (classResult.error) throw classResult.error;
      if (request !== requestVersion.current) return;
      if (readinessResult.error) {
        console.warn("[useMyClasses] readiness history load failed; using class fallback", readinessResult.error);
      }
      const data = classResult.data;
      if (!data || data.length === 0) {
        // Real signed-in user with no classes yet — return empty (real mode).
        setState({ classes: [], isReal: true, loading: false });
        return;
      }
      const readinessRows = (readinessResult.data ?? []) as ReadinessSnapshot[];
      const mapped: ClassInfo[] = data.map((row, i) => {
        const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? row.meta
          : {};
        return {
          uuid: row.id,
          id: row.client_class_id || row.id,
          name: row.name,
          professor: row.professor || "TBD",
          location: row.location || "",
          days: Array.isArray(meta.days)
            ? meta.days.filter((day): day is string => typeof day === "string")
            : [],
          time: typeof meta.time === "string" ? meta.time : "",
          color: row.color || palette[i % palette.length],
          currentTopic: row.current_topic || "Getting started",
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
        };
      });
      setState({ classes: mapped, isReal: true, loading: false });
    } catch (e) {
      if (request !== requestVersion.current) return;
      console.warn("[useMyClasses] load failed; showing empty real state (no demo fallback for signed-in users)", e);
      setState({ classes: [], isReal: true, loading: false });
    }
  }, [mode, user]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("coach:refresh", handler);
    return () => window.removeEventListener("coach:refresh", handler);
  }, [load]);

  return state;
}

const palette = ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-danger"];
