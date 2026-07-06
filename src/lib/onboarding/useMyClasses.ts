/**
 * useMyClasses — returns the current student's classes in the
 * `ClassInfo` shape the app already uses. Falls back to demo data
 * when the student hasn't onboarded or Supabase is unreachable.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAnonUserId } from "@/hooks/useClassIntelligence";
import { classes as demoClasses, type ClassInfo } from "@/data/demo";
import { isOnboarded } from "./store";

export function useMyClasses(): { classes: ClassInfo[]; isReal: boolean; loading: boolean } {
  const [state, setState] = useState<{ classes: ClassInfo[]; isReal: boolean; loading: boolean }>({
    classes: demoClasses,
    isReal: false,
    loading: isOnboarded(),
  });

  useEffect(() => {
    if (!isOnboarded()) {
      setState({ classes: demoClasses, isReal: false, loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const userId = getAnonUserId();
        const { data, error } = await supabase
          .from("classes")
          .select("id, client_class_id, name, professor, location, color, current_topic, readiness, meta")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        if (!data || data.length === 0) {
          setState({ classes: demoClasses, isReal: false, loading: false });
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
        console.warn("[useMyClasses] falling back to demo", e);
        if (!cancelled) setState({ classes: demoClasses, isReal: false, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

const palette = ["bg-primary", "bg-success", "bg-accent", "bg-warning", "bg-danger"];
