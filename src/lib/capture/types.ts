/**
 * Quick Capture — types shared across the capture flow.
 *
 * Every capture is a `CaptureDraft` that goes through a mock
 * processing pipeline today. When we wire real transcription, OCR
 * and file upload, only the processor internals change — the draft
 * shape and the emitted `CaptureResult` stay the same, so the UI and
 * downstream Student Model integration don't need to move.
 */

export type CaptureKind =
  | "record-lecture"
  | "scan-board"
  | "scan-textbook"
  | "scan-assignment"
  | "scan-material"
  | "scan-syllabus"
  | "upload-file"
  | "quick-note"
  | "professor-hint"
  | "ask-brain";

export interface CaptureContext {
  /** Class the capture is attached to (auto-detected when possible). */
  classId: string;
  /** ISO date (YYYY-MM-DD). Defaults to today. */
  date: string;
  /** Optional topic / chapter — filled from detection or user input. */
  topic?: string;
  /** Free-form text: quick note body, professor hint, or brain question. */
  text?: string;
  /** Optional existing assignment. New assignment scans may instead supply a title. */
  assignmentId?: string;
  assignmentTitle?: string;
  assignmentDueDate?: string;
  /** Optional exam this source should explicitly prepare the student for. */
  examId?: string;
}

export type ProcessingStepId =
  | "queued"
  | "class-detected"
  | "concepts-found"
  | "summary-created"
  | "flashcards-ready"
  | "added-to-brain";

export interface ProcessingStep {
  id: ProcessingStepId;
  label: string;
  /** Simulated dwell time (ms) — real steps replace this later. */
  duration: number;
}

export interface CaptureResult {
  id: string;
  kind: CaptureKind;
  context: CaptureContext;
  createdAt: string;
  /** Simulated derived artifacts. Real pipeline will replace these. */
  keyConcepts: string[];
  summary: string;
  flashcardCount: number;
  /** Durable AI handoff status for real captures. Demo captures omit this. */
  processingStatus?: "ready" | "processing" | "failed";
  /** Student-safe explanation when the note saved but AI processing did not. */
  processingMessage?: string;
}
