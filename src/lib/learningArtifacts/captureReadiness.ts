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
  try {
    const [conceptResult, captureResult] = await Promise.all([
      supabase
        .from("concepts")
        .select("id", { count: "exact", head: true })
        .eq("capture_id", captureId),
      supabase
        .from("captures")
        .select("processing_status")
        .eq("id", captureId)
        .maybeSingle(),
    ]);

    if (conceptResult.error || captureResult.error) return { state: "unknown" };

    const conceptCount = conceptResult.count ?? 0;
    if (conceptCount > 0) return { state: "ready", conceptCount };

    const status = (captureResult.data as { processing_status?: string } | null)?.processing_status;
    // No visible capture row yet means the insert is still settling — that is
    // a race, not an empty capture.
    if (!status || status === "processing") return { state: "processing" };
    return { state: "empty" };
  } catch {
    return { state: "unknown" };
  }
}
