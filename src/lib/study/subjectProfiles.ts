/**
 * App-facing entry point for subject-adaptive learning strategy profiles.
 *
 * The profile table itself lives with the Edge function shared code so the
 * generator prompts and the Study UI can never drift apart. This module is a
 * re-export plus small presentation helpers used by Study Lab.
 */

export {
  SUBJECT_PROFILES,
  SUBJECT_PROFILE_IDS,
  classifySubject,
  getSubjectProfile,
  orderStudyFormats,
  mergeTechniquePreferences,
  subjectPromptGuidance,
} from "../../../supabase/functions/_shared/subject-profiles";

export type {
  StudyFormat,
  SubjectProfile,
  SubjectProfileId,
  SubjectClassification,
  SubjectClassificationInput,
} from "../../../supabase/functions/_shared/subject-profiles";
