/**
 * useMyClasses — returns the current student's classes in the
 * `ClassInfo` shape the app already uses.
 *
 * Behavior:
 *   - Signed-in user: reads from Supabase (RLS scoped to `auth.uid()`).
 *     Reloads on auth state change.
 *   - Signed-out / demo mode: returns demo classes.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classes as demoClasses, type ClassInfo } from "@/data/demo";
import { useAuth } from "@/contexts/AuthContext";

export function useMyClasses(): { classes: ClassInfo[]; isReal: boolean; loading: boolean } {
  const { user, isDemoMode } = useAuth();
  const realMode = !!user && !isDemoMode;
  const [state, setState] = useState<{ classes: ClassInfo[]; isReal: boolean; loading: boolean }>(() => ({
    // Signed-in real users NEVER see demo classes — start empty while loading.
    classes: realMode ? [] : demoClasses,
    isReal: realMode,
    loading: realMode,
  }));

  useEffect(() => {
    if (!user || isDemoMode) {
      setState({ classes: demoClasses, isReal: false, loading: false });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("classes")
          .select("id, client_class_id, name, professor, location, color, current_topic, readiness, meta")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        if (!data || data.length === 0) {
          // Real signed-in user with no classes yet — return empty (real mode).
          setState({ classes: [], isReal: true, loading: false });
          return;
        }
        const mapped: ClassInfo[] = data.map((row: any, i: number) => ({
          id: row.client_class_id || row.id,
          name: row.name,
          professor: row.professor || "TBD",
          location: row.location || "",
          days: (row.meta?.days as string[]) || [],
          time: (row.meta?.time as string) || "",
          color: row.color || palette[i % palette.length],
          currentTopic: row.current_topic || "Getting started",
          nextExamDate: "",
          readiness: row.readiness ?? 0,
          suggestedAction: "Add your first capture for this class",
          gradingWeights: [],
          chapters: [],
        }));
        setState({ classes: mapped, isReal: true, loading: false });
      } catch (e) {
        console.warn("[useMyClasses] load failed; showing empty real state (no demo fallback for signed-in users)", e);
        if (!cancelled) setState({ classes: [], isReal: true, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return state;
}

const palette = ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-danger"];
