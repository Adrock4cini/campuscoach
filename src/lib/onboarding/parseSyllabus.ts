import { supabase } from "@/integrations/supabase/client";
import type { OnboardingClass } from "./types";

export interface ParsedSyllabus {
  student?: { name?: string | null; school?: string | null; term?: string | null } | null;
  classes: OnboardingClass[];
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function parseSyllabusFile(
  file: File,
  hint?: string
): Promise<ParsedSyllabus> {
  const dataUrl = await fileToDataUrl(file);
  const { data, error } = await supabase.functions.invoke("parse-syllabus", {
    body: {
      fileDataUrl: dataUrl,
      filename: file.name,
      mimeType: file.type,
      hint,
    },
  });
  if (error) throw error;
  const result = (data ?? {}) as ParsedSyllabus;
  // Normalize: guarantee arrays
  result.classes = (result.classes ?? []).map((c) => ({
    ...c,
    days: Array.isArray(c.days) ? c.days : [],
    examDates: Array.isArray(c.examDates) ? c.examDates : [],
    assignments: Array.isArray(c.assignments) ? c.assignments : [],
    schedule: Array.isArray(c.schedule) ? c.schedule : [],
  }));
  return result;
}
