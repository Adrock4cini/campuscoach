import { supabase } from "@/integrations/supabase/client";
import type { MemoryTrickTechnique } from "./memoryTrick";

export interface MemoryFeedbackInput {
  artifactId: string;
  conceptId: string;
  technique: MemoryTrickTechnique;
  helpful: boolean;
}

/**
 * Best-effort, privacy-minimal feedback. The server derives the owner from the
 * signed-in session and accepts only IDs plus a fixed technique category.
 */
export async function recordMemoryTrickFeedback(input: MemoryFeedbackInput) {
  try {
    const request = supabase.rpc("record_memory_trick_feedback", {
      p_artifact_id: input.artifactId,
      p_concept_id: input.conceptId,
      p_technique: input.technique,
      p_helpful: input.helpful,
    });
    const { data, error } = await Promise.resolve(request);
    return error === null && data === true;
  } catch {
    return false;
  }
}
