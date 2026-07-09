/**
 * Learning artifacts — disposable, regeneratable views of one or more
 * permanent Concepts.
 *
 * The `learning_artifacts` row shape is generic; the `payload` JSON
 * shape is owned by the `kind`. Add a new kind by:
 *   1. Adding it to `ArtifactKind` (must match the DB enum).
 *   2. Adding the payload interface below.
 *   3. Adding a prompt template in the `generate-artifact` edge fn.
 * No table, hook, or component contract changes are required.
 */

export type ArtifactKind =
  | "flashcards"
  | "multiple_choice"
  | "fill_blank"
  | "matching"
  | "practice"
  | "study_guide"
  | "cheat_sheet"
  | "eli5"
  | "eli_professor"
  | "mnemonic";

export interface FlashcardsPayload {
  cards: Array<{ front: string; back: string }>;
}

export interface MultipleChoicePayload {
  questions: Array<{
    prompt: string;
    choices: string[];
    answerIndex: number;
    rationale: string;
  }>;
}

// Reserved payload shapes (implemented later). Kept here so every
// consumer already knows the shape when the template lands.
export interface FillBlankPayload { items: Array<{ sentence: string; answer: string }> }
export interface MatchingPayload { pairs: Array<{ left: string; right: string }> }
export interface PracticePayload { problems: Array<{ prompt: string; hint: string; solution: string }> }
export interface StudyGuidePayload { sections: Array<{ heading: string; body: string }> }
export interface CheatSheetPayload { bullets: string[] }
export interface Eli5Payload { text: string }
export interface EliProfessorPayload { text: string }
export interface MnemonicPayload { items: Array<{ concept: string; mnemonic: string }> }

export type ArtifactPayloadByKind = {
  flashcards: FlashcardsPayload;
  multiple_choice: MultipleChoicePayload;
  fill_blank: FillBlankPayload;
  matching: MatchingPayload;
  practice: PracticePayload;
  study_guide: StudyGuidePayload;
  cheat_sheet: CheatSheetPayload;
  eli5: Eli5Payload;
  eli_professor: EliProfessorPayload;
  mnemonic: MnemonicPayload;
};

export interface LearningArtifact<K extends ArtifactKind = ArtifactKind> {
  id: string;
  user_id: string;
  class_id: string | null;
  kind: K;
  concept_ids: string[];
  capture_id: string | null;
  topic: string | null;
  payload: ArtifactPayloadByKind[K];
  model: string | null;
  prompt_version: string;
  stale: boolean;
  created_at: string;
  updated_at: string;
}
