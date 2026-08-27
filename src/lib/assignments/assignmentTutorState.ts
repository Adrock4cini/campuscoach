/**
 * Session-only progress for the assignment tutor.
 *
 * The generated artifact remains the source of truth for prompts, choices and
 * answers. This snapshot intentionally stores only identifiers and interaction
 * state, so restoring a tab cannot leak an answer before the student attempts
 * the problem.
 */

export const ASSIGNMENT_TUTOR_STATE_KEY = "campus-coach:assignment-tutor:v5";
export const ASSIGNMENT_TUTOR_STATE_VERSION = 5;
export const MAX_ASSIGNMENT_TUTOR_SESSION_MS = 86_400_000;

export type AssignmentTutorStage =
  | "hint"
  | "walkthrough"
  | "original-attempt"
  | "original-feedback"
  | "transfer-attempt"
  | "transfer-feedback"
  | "saving"
  | "save-error"
  | "done";

export type AssignmentTutorConfidence = "low" | "medium" | "high";
export type AssignmentTutorHelp = "hint" | "walkthrough" | "transfer-retry";
export type AssignmentTutorResultOutcome = "saved" | "already-recorded";

export interface AssignmentTutorState {
  version: typeof ASSIGNMENT_TUTOR_STATE_VERSION;
  artifactId: string;
  assignmentId: string;
  captureId: string;
  problemId: string;
  stage: AssignmentTutorStage;
  helpUsed: AssignmentTutorHelp[];
  originalSelection: number | null;
  transferSelection: number | null;
  confidence: AssignmentTutorConfidence | null;
  /** Immutable first independent answer, retained if the student practices a retry. */
  firstTransferSelection: number | null;
  firstTransferConfidence: AssignmentTutorConfidence | null;
  /** Once a save is attempted, the graded payload is frozen for exact replay. */
  submissionLocked: boolean;
  submissionDurationSeconds: number | null;
  resultSaved: boolean;
  resultOutcome: AssignmentTutorResultOutcome | null;
  attemptId: string;
  startedAt: number;
}

export interface AssignmentTutorStateContext {
  artifactId: string;
  assignmentId: string;
  captureId: string;
  problemId: string;
  originalChoiceCount: number;
  transferChoiceCount: number;
}

export type AssignmentTutorAction =
  | { type: "use-hint" }
  | { type: "show-walkthrough" }
  | { type: "start-original-attempt" }
  | { type: "select-original"; index: number }
  | { type: "check-original" }
  | { type: "start-transfer-attempt" }
  | { type: "select-transfer"; index: number }
  | { type: "set-confidence"; confidence: AssignmentTutorConfidence }
  | { type: "check-transfer" }
  | { type: "retry-transfer" }
  | { type: "start-saving"; durationSeconds: number }
  | { type: "save-failed" }
  | { type: "saved" }
  | { type: "already-recorded" }
  | { type: "finish" };

const STAGES = new Set<AssignmentTutorStage>([
  "hint",
  "walkthrough",
  "original-attempt",
  "original-feedback",
  "transfer-attempt",
  "transfer-feedback",
  "saving",
  "save-error",
  "done",
]);

const HELP_VALUES = new Set<AssignmentTutorHelp>([
  "hint",
  "walkthrough",
  "transfer-retry",
]);

const STATE_KEYS = new Set([
  "version",
  "artifactId",
  "assignmentId",
  "captureId",
  "problemId",
  "stage",
  "helpUsed",
  "originalSelection",
  "transferSelection",
  "confidence",
  "firstTransferSelection",
  "firstTransferConfidence",
  "submissionLocked",
  "submissionDurationSeconds",
  "resultSaved",
  "resultOutcome",
  "attemptId",
  "startedAt",
]);

function safeStorage(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function validAttemptId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validConfidence(value: unknown): value is AssignmentTutorConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function validSelection(value: unknown, choiceCount: number): value is number | null {
  return value === null
    || (Number.isInteger(value) && (value as number) >= 0 && (value as number) < choiceCount);
}

function withHelp(
  helpUsed: AssignmentTutorHelp[],
  help: AssignmentTutorHelp,
): AssignmentTutorHelp[] {
  return helpUsed.includes(help) ? helpUsed : [...helpUsed, help];
}

/**
 * A small reducer keeps answer gates explicit. Invalid/out-of-order events are
 * ignored instead of accidentally revealing feedback.
 */
export function assignmentTutorReducer(
  state: AssignmentTutorState,
  action: AssignmentTutorAction,
): AssignmentTutorState {
  switch (action.type) {
    case "use-hint":
      return state.stage === "hint"
        ? { ...state, helpUsed: withHelp(state.helpUsed, "hint") }
        : state;
    case "show-walkthrough":
      return state.stage === "hint" && state.helpUsed.includes("hint")
        ? {
            ...state,
            stage: "walkthrough",
            helpUsed: withHelp(state.helpUsed, "walkthrough"),
          }
        : state;
    case "start-original-attempt":
      return state.stage === "walkthrough"
        ? { ...state, stage: "original-attempt" }
        : state;
    case "select-original":
      return state.stage === "original-attempt" && Number.isInteger(action.index) && action.index >= 0
        ? { ...state, originalSelection: action.index }
        : state;
    case "check-original":
      return state.stage === "original-attempt" && state.originalSelection !== null
        ? { ...state, stage: "original-feedback" }
        : state;
    case "start-transfer-attempt":
      return state.stage === "original-feedback"
        ? {
            ...state,
            stage: "transfer-attempt",
            transferSelection: null,
            confidence: null,
          }
        : state;
    case "select-transfer":
      return state.stage === "transfer-attempt" && Number.isInteger(action.index) && action.index >= 0
        ? { ...state, transferSelection: action.index }
        : state;
    case "set-confidence":
      return state.stage === "transfer-attempt"
        ? { ...state, confidence: action.confidence }
        : state;
    case "check-transfer":
      return state.stage === "transfer-attempt"
        && state.transferSelection !== null
        && state.confidence !== null
        ? {
            ...state,
            stage: "transfer-feedback",
            firstTransferSelection: state.firstTransferSelection ?? state.transferSelection,
            firstTransferConfidence: state.firstTransferConfidence ?? state.confidence,
          }
        : state;
    case "retry-transfer":
      return state.stage === "transfer-feedback" && (!state.submissionLocked || state.resultOutcome !== null)
        ? {
            ...state,
            stage: "transfer-attempt",
            helpUsed: withHelp(state.helpUsed, "transfer-retry"),
            transferSelection: null,
            confidence: null,
          }
        : state;
    case "start-saving":
      return (state.stage === "transfer-feedback" || state.stage === "save-error")
        && state.resultOutcome === null
        && Number.isInteger(action.durationSeconds)
        && action.durationSeconds >= 1
        && action.durationSeconds <= 86_400
        ? {
            ...state,
            stage: "saving",
            submissionLocked: true,
            submissionDurationSeconds: state.submissionDurationSeconds ?? action.durationSeconds,
          }
        : state;
    case "save-failed":
      return state.stage === "saving"
        ? { ...state, stage: "save-error" }
        : state;
    case "saved":
      return state.stage === "saving"
        ? { ...state, stage: "transfer-feedback", resultSaved: true, resultOutcome: "saved" }
        : state;
    case "already-recorded":
      return state.stage === "saving"
        ? {
            ...state,
            stage: "transfer-feedback",
            resultSaved: false,
            resultOutcome: "already-recorded",
          }
        : state;
    case "finish":
      return state.stage === "transfer-feedback" && state.resultOutcome !== null
        ? { ...state, stage: "done" }
        : state;
  }
}

export function createAssignmentTutorState(
  context: Pick<AssignmentTutorStateContext, "artifactId" | "assignmentId" | "captureId" | "problemId">,
  options: { attemptId?: string; startedAt?: number } = {},
): AssignmentTutorState {
  return {
    version: ASSIGNMENT_TUTOR_STATE_VERSION,
    artifactId: context.artifactId,
    assignmentId: context.assignmentId,
    captureId: context.captureId,
    problemId: context.problemId,
    stage: "hint",
    helpUsed: [],
    originalSelection: null,
    transferSelection: null,
    confidence: null,
    firstTransferSelection: null,
    firstTransferConfidence: null,
    submissionLocked: false,
    submissionDurationSeconds: null,
    resultSaved: false,
    resultOutcome: null,
    attemptId: options.attemptId ?? createAssignmentTutorAttemptId(),
    startedAt: options.startedAt ?? Date.now(),
  };
}

export function createAssignmentTutorAttemptId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function assignmentTutorStateStorageKey(
  identity: Pick<AssignmentTutorState, "artifactId" | "problemId">,
): string {
  return `${ASSIGNMENT_TUTOR_STATE_KEY}:${encodeURIComponent(identity.artifactId)}:${encodeURIComponent(identity.problemId)}`;
}

/** Writes a canonical allow-listed snapshot; answer/source fields cannot leak. */
export function writeAssignmentTutorState(
  state: AssignmentTutorState,
  storage?: Storage | null,
): void {
  const store = safeStorage(storage);
  if (!store) return;
  const snapshot: AssignmentTutorState = {
    version: ASSIGNMENT_TUTOR_STATE_VERSION,
    artifactId: state.artifactId,
    assignmentId: state.assignmentId,
    captureId: state.captureId,
    problemId: state.problemId,
    stage: state.stage,
    helpUsed: [...state.helpUsed],
    originalSelection: state.originalSelection,
    transferSelection: state.transferSelection,
    confidence: state.confidence,
    firstTransferSelection: state.firstTransferSelection,
    firstTransferConfidence: state.firstTransferConfidence,
    submissionLocked: state.submissionLocked,
    submissionDurationSeconds: state.submissionDurationSeconds,
    resultSaved: state.resultSaved,
    resultOutcome: state.resultOutcome,
    attemptId: state.attemptId,
    startedAt: state.startedAt,
  };
  try {
    store.setItem(assignmentTutorStateStorageKey(state), JSON.stringify(snapshot));
  } catch {
    // Blocked/full session storage must not interrupt tutoring.
  }
}

export function clearAssignmentTutorState(
  identity: Pick<AssignmentTutorState, "artifactId" | "problemId">,
  storage?: Storage | null,
): void {
  try {
    safeStorage(storage)?.removeItem(assignmentTutorStateStorageKey(identity));
  } catch {
    // Best effort after a confirmed durable save.
  }
}

/**
 * Restores only an exact match for the current assignment artifact. Choice
 * bounds and stage invariants are rechecked against the current payload.
 */
export function readAssignmentTutorState(
  context: AssignmentTutorStateContext & { storage?: Storage | null; now?: number },
): AssignmentTutorState | null {
  const store = safeStorage(context.storage);
  if (!store || context.originalChoiceCount <= 0 || context.transferChoiceCount <= 0) return null;

  let raw: string | null;
  try {
    raw = store.getItem(assignmentTutorStateStorageKey(context));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!Object.keys(record).every((key) => STATE_KEYS.has(key))) return null;
  if (record.version !== ASSIGNMENT_TUTOR_STATE_VERSION) return null;
  if (!validId(record.artifactId) || record.artifactId !== context.artifactId) return null;
  if (!validId(record.assignmentId) || record.assignmentId !== context.assignmentId) return null;
  if (!validId(record.captureId) || record.captureId !== context.captureId) return null;
  if (!validId(record.problemId) || record.problemId !== context.problemId) return null;
  if (typeof record.stage !== "string" || !STAGES.has(record.stage as AssignmentTutorStage)) return null;
  if (!Array.isArray(record.helpUsed)
    || record.helpUsed.length > HELP_VALUES.size
    || new Set(record.helpUsed).size !== record.helpUsed.length
    || !record.helpUsed.every((help) => typeof help === "string" && HELP_VALUES.has(help as AssignmentTutorHelp))) {
    return null;
  }
  if (!validSelection(record.originalSelection, context.originalChoiceCount)) return null;
  if (!validSelection(record.transferSelection, context.transferChoiceCount)) return null;
  if (record.confidence !== null && !validConfidence(record.confidence)) return null;
  if (!validSelection(record.firstTransferSelection, context.transferChoiceCount)) return null;
  if (record.firstTransferConfidence !== null && !validConfidence(record.firstTransferConfidence)) return null;
  if (typeof record.submissionLocked !== "boolean") return null;
  if (record.submissionDurationSeconds !== null
    && (!Number.isInteger(record.submissionDurationSeconds)
      || (record.submissionDurationSeconds as number) < 1
      || (record.submissionDurationSeconds as number) > 86_400)) {
    return null;
  }
  if (typeof record.resultSaved !== "boolean") return null;
  if (record.resultOutcome !== null
    && record.resultOutcome !== "saved"
    && record.resultOutcome !== "already-recorded") return null;
  if (!validAttemptId(record.attemptId)) return null;
  const now = context.now ?? Date.now();
  if (!Number.isSafeInteger(record.startedAt)
    || (record.startedAt as number) <= 0
    || (record.startedAt as number) > now + 5 * 60_000
    || now - (record.startedAt as number) > MAX_ASSIGNMENT_TUTOR_SESSION_MS) {
    return null;
  }

  const state: AssignmentTutorState = {
    version: ASSIGNMENT_TUTOR_STATE_VERSION,
    artifactId: record.artifactId,
    assignmentId: record.assignmentId,
    captureId: record.captureId,
    problemId: record.problemId,
    stage: record.stage as AssignmentTutorStage,
    helpUsed: record.helpUsed as AssignmentTutorHelp[],
    originalSelection: record.originalSelection as number | null,
    transferSelection: record.transferSelection as number | null,
    confidence: record.confidence as AssignmentTutorConfidence | null,
    firstTransferSelection: record.firstTransferSelection as number | null,
    firstTransferConfidence: record.firstTransferConfidence as AssignmentTutorConfidence | null,
    submissionLocked: record.submissionLocked,
    submissionDurationSeconds: record.submissionDurationSeconds as number | null,
    resultSaved: record.resultSaved,
    resultOutcome: record.resultOutcome as AssignmentTutorResultOutcome | null,
    attemptId: record.attemptId,
    startedAt: record.startedAt as number,
  };
  return validStageState(state) ? state : null;
}

function validStageState(state: AssignmentTutorState): boolean {
  const hasHint = state.helpUsed.includes("hint");
  const hasWalkthrough = state.helpUsed.includes("walkthrough");
  const hasOriginal = state.originalSelection !== null;
  const hasTransfer = state.transferSelection !== null;
  const hasConfidence = state.confidence !== null;
  const hasFirstTransfer = state.firstTransferSelection !== null;
  const hasFirstConfidence = state.firstTransferConfidence !== null;
  const progressedPastHint = state.stage !== "hint";
  const progressedPastWalkthrough = !["hint", "walkthrough"].includes(state.stage);
  const progressedPastOriginalAttempt = !["hint", "walkthrough", "original-attempt"].includes(state.stage);
  const transferStarted = ["transfer-attempt", "transfer-feedback", "saving", "save-error", "done"].includes(state.stage);
  const transferFinished = ["transfer-feedback", "saving", "save-error", "done"].includes(state.stage);

  if (hasWalkthrough && !hasHint) return false;
  if (state.stage === "hint" && hasWalkthrough) return false;
  if (progressedPastHint && (!hasHint || !hasWalkthrough)) return false;
  if (progressedPastWalkthrough && !hasOriginal && state.stage !== "original-attempt") return false;
  if (progressedPastOriginalAttempt && !hasOriginal) return false;
  if (!transferStarted && (hasTransfer || hasConfidence || state.helpUsed.includes("transfer-retry"))) return false;
  if (!transferFinished && state.stage !== "transfer-attempt" && (hasTransfer || hasConfidence)) return false;
  if (transferFinished && (!hasTransfer || !hasConfidence)) return false;
  if (state.stage === "original-feedback" && (hasTransfer || hasConfidence)) return false;
  if (hasFirstTransfer !== hasFirstConfidence) return false;
  if (!transferFinished && state.stage !== "transfer-attempt" && hasFirstTransfer) return false;
  if (transferFinished && (!hasFirstTransfer || !hasFirstConfidence)) return false;
  if (state.helpUsed.includes("transfer-retry") && (!hasFirstTransfer || !hasFirstConfidence)) return false;
  if (state.submissionLocked !== (state.submissionDurationSeconds !== null)) return false;
  if (state.submissionLocked && !transferFinished) return false;
  if (["saving", "save-error", "done"].includes(state.stage) && !state.submissionLocked) return false;
  if (state.resultSaved && !state.submissionLocked) return false;
  if (state.resultSaved !== (state.resultOutcome === "saved")) return false;
  if (state.resultOutcome !== null && !state.submissionLocked) return false;
  if (state.stage === "save-error" && state.resultOutcome !== null) return false;
  if (state.stage === "done" && state.resultOutcome === null) return false;
  return true;
}
