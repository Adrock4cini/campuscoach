import {
  classifySubject,
  getSubjectProfile,
  type SubjectProfileId,
} from "./subject-profiles.ts";

export const CAPTURE_CLASS_GUARD_VERSION = "photo-wrong-class-gate-v3";

export interface CaptureClassMismatch {
  detectedSubject: string;
  detectedSubjectId: SubjectProfileId;
  selectedClassName: string;
}

/**
 * Stop only clear cross-subject mistakes. Unknown/generic classes and thin
 * source evidence pass through so a legitimate worksheet is never blocked by
 * a guess. The image worker calls this after OCR but before any learning rows
 * are written.
 */
export function detectCaptureClassMismatch(input: {
  selectedClassName: string;
  selectedClassCode?: string | null;
  sourceText?: string | null;
  summary?: string | null;
  conceptNames?: readonly (string | null | undefined)[];
}): CaptureClassMismatch | null {
  const selected = classifySubject({
    className: input.selectedClassName,
    classCode: input.selectedClassCode,
  });
  const sourceSubject = classifySubject({
    topics: [input.sourceText, input.summary],
  });
  const conceptSubject = classifySubject({
    conceptNames: input.conceptNames,
  });
  // The generic study classifier deliberately takes the first matching
  // evidence layer. For a capture gate, a thin OCR hit (for example just
  // "Accounting") must not hide stronger, agreeing extracted concepts.
  // Keep weak, conflicting subjects uncertain rather than choosing a side.
  const detected = sourceSubject.primary === "general"
    || (
      sourceSubject.confidence < 0.6
      && sourceSubject.primary === conceptSubject.primary
      && conceptSubject.confidence >= 0.6
    )
    ? conceptSubject
    : sourceSubject;

  if (
    selected.primary === "general"
    || detected.primary === "general"
    || selected.primary === detected.primary
    || selected.confidence < 0.6
    || detected.confidence < 0.6
  ) {
    return null;
  }

  return {
    detectedSubject: getSubjectProfile(detected.primary).label,
    detectedSubjectId: detected.primary,
    selectedClassName: input.selectedClassName,
  };
}
