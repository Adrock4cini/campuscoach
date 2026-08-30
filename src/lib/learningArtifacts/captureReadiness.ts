/**
 * A capture becomes studyable only after `process-capture-images` /
 * `extract-concepts` has written Concept rows for it. Study Lab must ask the
 * database about that state before it ever calls the paid generator, so a
 * student who taps "Practice this now" one second after saving sees an honest
 * "still reading your capture" instead of "No concepts found".
 */
import { supabase } from "@/integrations/supabase/client";

export type CaptureConceptReadiness =
  | { state: "ready"; conceptCount: number }
  /** Extraction is still running (or the capture row is not visible yet). */
  | { state: "processing" }
  /** Processing finished but produced nothing to study. */
  | { state: "empty" }
  /** The readiness probe itself failed; let the caller try generation. */
  | { state: "unknown" };

export async function checkCaptureConceptReadiness(
  captureId: string,
): Promise<CaptureConceptReadiness> {
  if (!captureId) return { state: "unknown" };

  // `concept_capture_evidence` ships in 20260827100000_concept_capture_evidence.sql.
  // The generated types come from a backend that is behind that migration, so
  // this one table is reached through a narrow structural view rather than by
  // editing generated types or weakening the probe itself. Built inside the
  // try below so a throwing client stays a "unknown" probe, never a crash.
  type EvidenceClient = {
    from: (table: string) => {
      select: (
        columns: string,
        options: { count: "exact"; head: true },
      ) => {
        eq: (
          column: string,
          value: string,
        ) => PromiseLike<{ count: number | null; error: unknown }>;
      };
    };
  };

  try {
    const [conceptResult, captureResult] = await Promise.all([
      (supabase as unknown as EvidenceClient)
        .from("concept_capture_evidence")
        .select("concept_id", { count: "exact", head: true })
        .eq("capture_id", captureId),
      supabase
        .from("captures")
        .select("processing_status")
        .eq("id", captureId)
        .maybeSingle(),
    ]);

    if (conceptResult.error || captureResult.error) return { state: "unknown" };

    const conceptCount = conceptResult.count ?? 0;
    const status = (captureResult.data as { processing_status?: string } | null)?.processing_status;
    // Evidence is written before processed_content and the final capture
    // completion CAS. Never let a browser readiness probe steal an active
    // extraction claim by flipping the capture to ready.
    if (status === "ready" && conceptCount > 0) return { state: "ready", conceptCount };
    // No visible capture row yet means the insert is still settling — that is
    // a race, not an empty capture.
    if (!status || status === "queued" || status === "processing") return { state: "processing" };
    return { state: "empty" };
  } catch {
    return { state: "unknown" };
  }
}
