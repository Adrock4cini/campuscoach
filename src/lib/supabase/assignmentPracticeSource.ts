import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import {
  MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS,
  assignmentPracticeSourceFromUnknown,
  isConfirmedAssignmentPracticeSource,
  type AssignmentPracticeSource,
} from "@/lib/assignments/assignmentPracticeSource";

export interface ConfirmAssignmentPracticeSourceInput {
  captureId: string;
  assignmentId: string;
  classId: string;
  text: string;
  expectedVersion: number;
}

interface FunctionInvokeError {
  message?: string;
  context?: unknown;
}

export class AssignmentPracticeSourceConfirmationError extends Error {
  constructor(message: string, public readonly reason: string | null = null) {
    super(message);
    this.name = "AssignmentPracticeSourceConfirmationError";
  }
}

async function confirmationError(error: FunctionInvokeError): Promise<AssignmentPracticeSourceConfirmationError> {
  const response = error.context instanceof Response ? error.context : null;
  let serverMessage: string | null = null;
  let reason: string | null = null;
  if (response) {
    try {
      const body = await response.clone().json() as { error?: unknown; message?: unknown; reason?: unknown };
      const message = typeof body.error === "string" ? body.error : body.message;
      serverMessage = typeof message === "string" ? message.trim() : null;
      reason = typeof body.reason === "string" ? body.reason : null;
    } catch {
      serverMessage = null;
    }
  }
  if (!response) return new AssignmentPracticeSourceConfirmationError(
    "Couldn’t confirm this problem. Check your connection and try again.",
  );
  if (response.status === 401) return new AssignmentPracticeSourceConfirmationError(
    "Your session expired. Sign in again, then retry.",
    reason,
  );
  if (response.status === 409) {
    return new AssignmentPracticeSourceConfirmationError(
      serverMessage || "This problem changed in another tab. Reload it and check the latest text.",
      reason,
    );
  }
  if (response.status === 422) {
    return new AssignmentPracticeSourceConfirmationError(
      serverMessage || "Check the problem wording and include one complete percent or discount problem.",
      reason,
    );
  }
  if (response.status >= 500) {
    return new AssignmentPracticeSourceConfirmationError(
      "Campus Companion couldn’t confirm this problem yet. Your edit is still here—try again.",
      reason,
    );
  }
  return new AssignmentPracticeSourceConfirmationError(
    serverMessage || error.message || "Couldn’t confirm this problem. Please try again.",
    reason,
  );
}

export async function confirmAssignmentPracticeSource(
  input: ConfirmAssignmentPracticeSourceInput,
): Promise<AssignmentPracticeSource> {
  const text = input.text.trim();
  if (!text) throw new Error("Enter the complete problem before continuing.");
  if (text.length > MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS) {
    throw new Error(`Keep the problem to ${MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS} characters or fewer.`);
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error("Reload this problem before confirming it.");
  }

  const { data, error } = await invokeEdgeFunction("confirm-assignment-practice-source", {
    body: {
      captureId: input.captureId,
      assignmentId: input.assignmentId,
      classId: input.classId,
      text,
      expectedVersion: input.expectedVersion,
    },
  });
  if (error) throw await confirmationError(error);

  const response = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const source = assignmentPracticeSourceFromUnknown(
    response?.practiceSource ?? response,
    "scan-assignment",
  );
  if (response?.ok !== true || !isConfirmedAssignmentPracticeSource(source)) {
    throw new Error("The confirmed problem could not be verified. Your edit is still here—try again.");
  }
  return source;
}
