import { extractAssignmentTutorSource } from "../../../supabase/functions/_shared/assignment-tutor";
import {
  isConfirmedAssignmentPracticeSource,
  type AssignmentPracticeSource,
} from "./assignmentPracticeSource";

export function isAssignmentTutorTextSupported(
  text: string | null | undefined,
): boolean {
  const normalized = text?.trim();
  return Boolean(normalized && extractAssignmentTutorSource(normalized));
}

/**
 * A structurally confirmed row is not enough to enter Tutor. Re-check the
 * deterministic launch parser so a legacy or drifted row fails back to review
 * instead of starting an unsupported generation request.
 */
export function isConfirmedAssignmentTutorPracticeSource(
  source: AssignmentPracticeSource,
): boolean {
  return (
    isConfirmedAssignmentPracticeSource(source) &&
    isAssignmentTutorTextSupported(source.text)
  );
}
