import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AssignmentPracticeSourceConfirmationError,
  confirmAssignmentPracticeSource,
} from "./assignmentPracticeSource";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({
  invokeEdgeFunction: mocks.invoke,
}));

const confirmed = {
  status: "confirmed",
  text: "What is 14% of 50?",
  version: 2,
  hash: "a".repeat(64),
  confirmedAt: "2026-08-27T12:00:00.000Z",
};

describe("confirmAssignmentPracticeSource", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("sends the exact target and accepts only a confirmed server response", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        practiceSourceStatus: confirmed.status,
        practiceSourceText: confirmed.text,
        practiceSourceVersion: confirmed.version,
        practiceSourceHash: confirmed.hash,
        practiceSourceConfirmedAt: confirmed.confirmedAt,
      },
      error: null,
    });

    await expect(confirmAssignmentPracticeSource({
      captureId: "capture-1",
      assignmentId: "assignment-1",
      classId: "math",
      text: "  What is 14% of 50?  ",
      expectedVersion: 1,
    })).resolves.toEqual(confirmed);

    expect(mocks.invoke).toHaveBeenCalledWith("confirm-assignment-practice-source", {
      body: {
        captureId: "capture-1",
        assignmentId: "assignment-1",
        classId: "math",
        text: "What is 14% of 50?",
        expectedVersion: 1,
      },
    });
  });

  it("fails closed on a null or malformed success", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, practiceSource: null }, error: null });

    await expect(confirmAssignmentPracticeSource({
      captureId: "capture-1",
      assignmentId: "assignment-1",
      classId: "math",
      text: "What is 14% of 50?",
      expectedVersion: 1,
    })).rejects.toThrow(/could not be verified/i);
  });

  it("turns a stale-version response into a recoverable message", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "This problem changed. Reload it." }), { status: 409 }),
      },
    });

    await expect(confirmAssignmentPracticeSource({
      captureId: "capture-1",
      assignmentId: "assignment-1",
      classId: "math",
      text: "What is 14% of 50?",
      expectedVersion: 1,
    })).rejects.toThrow("This problem changed. Reload it.");
  });

  it("preserves the structured unsupported reason for a fallback action", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          error: "This Tutor version does not support that problem yet.",
          reason: "unsupported_assignment_problem",
        }), { status: 422 }),
      },
    });

    const failure = await confirmAssignmentPracticeSource({
      captureId: "capture-1",
      assignmentId: "assignment-1",
      classId: "math",
      text: "Solve x + 3 = 10.",
      expectedVersion: 1,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AssignmentPracticeSourceConfirmationError);
    expect(failure).toMatchObject({ reason: "unsupported_assignment_problem" });
  });
});
