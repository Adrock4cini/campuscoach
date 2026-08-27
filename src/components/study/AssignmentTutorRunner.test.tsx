import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentTutorRunner } from "./AssignmentTutorRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { assignmentTutorStateStorageKey } from "@/lib/assignments/assignmentTutorState";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({
    data: { ok: true, sessionId: "session-1", readiness: 62, readinessDelta: 8 },
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const artifact: LearningArtifact<"practice"> = {
  id: "artifact-1",
  user_id: "user-1",
  class_id: "class-1",
  client_class_id: "math",
  kind: "practice",
  concept_ids: ["concept-1"],
  capture_id: "capture-1",
  topic: "Percent of a number",
  study_scope_type: "recent",
  study_scope_id: "capture-capture-1",
  study_scope_label: "This assignment",
  study_scope_snapshot: { assignmentId: "assignment-1" },
  payload: {
    problems: [{
      id: "problem-1",
      conceptId: "concept-1",
      conceptName: "Percent of a number",
      sourceExcerpt: "Find 14% of 50.",
      routeKind: "solve-problems",
      original: {
        prompt: "What is 14% of 50?",
        choices: ["5", "6", "7", "14"],
        answerIndex: 2,
        rationale: "Convert 14% to 0.14, then multiply by 50 to get 7.",
      },
      hint: "Rewrite the percent as a decimal, then multiply it by the whole.",
      walkthrough: {
        prompt: "What is 20% of 50?",
        steps: ["Rewrite 20% as 0.20.", "Multiply 0.20 by 50."],
        answer: "10",
      },
      transfer: {
        prompt: "What is 15% of 80?",
        choices: ["8", "10", "12", "15"],
        answerIndex: 2,
        rationale: "0.15 multiplied by 80 equals 12.",
      },
    }],
  },
  model: "deterministic-assignment-tutor-v1",
  prompt_version: "v10-teaching-router",
  stale: false,
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
};

const tutorStorageKey = () => assignmentTutorStateStorageKey({
  artifactId: artifact.id,
  problemId: artifact.payload.problems[0].id,
});

function renderRunner(onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...render(
      <AssignmentTutorRunner
        open
        onOpenChange={onOpenChange}
        artifact={artifact}
        assignmentId="assignment-1"
        captureId="capture-1"
      />,
    ),
  };
}

function reachOriginalAttempt() {
  fireEvent.click(screen.getByRole("button", { name: /give me a hint/i }));
  fireEvent.click(screen.getByRole("button", { name: /see a worked example/i }));
  fireEvent.click(screen.getByRole("button", { name: /now i’ll try mine/i }));
}

function reachTransferAttempt(originalChoice = "7") {
  reachOriginalAttempt();
  fireEvent.click(screen.getByRole("button", { name: originalChoice }));
  fireEvent.click(screen.getByRole("button", { name: /check my answer/i }));
  fireEvent.click(screen.getByRole("button", { name: /try a new problem/i }));
}

function answerTransfer(choice: string, confidence = /very sure/i) {
  fireEvent.click(screen.getByRole("button", { name: choice }));
  fireEvent.click(screen.getByRole("button", { name: confidence }));
  fireEvent.click(screen.getByRole("button", { name: /^check answer$/i }));
}

describe("AssignmentTutorRunner", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: { ok: true, sessionId: "session-1", readiness: 62, readinessDelta: 8 },
      error: null,
    });
    sessionStorage.clear();
  });

  it("gates answers through hint, analogous walkthrough, original try, and transfer", async () => {
    renderRunner();

    expect(screen.getByText("What is 14% of 50?")).toBeInTheDocument();
    expect(screen.queryByText(/convert 14% to 0\.14/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/example answer/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /give me a hint/i }));
    expect(screen.getByText(/rewrite the percent as a decimal/i)).toBeInTheDocument();
    expect(screen.queryByText(/convert 14% to 0\.14/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /see a worked example/i }));
    expect(screen.getByTestId("assignment-tutor-stage")).toHaveFocus();
    expect(screen.getByText("What is 20% of 50?")).toBeInTheDocument();
    expect(screen.getByText(/example answer: 10/i)).toBeInTheDocument();
    expect(screen.queryByText(/convert 14% to 0\.14/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /now i’ll try mine/i }));
    const originalChoice = screen.getByRole("button", { name: "7" });
    expect(originalChoice).toHaveClass("min-h-11");
    fireEvent.click(originalChoice);
    expect(screen.queryByText(/^Correct\.$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /check my answer/i }));
    expect(screen.getByText(/^Correct\.$/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /try a new problem/i }));
    expect(screen.getByText("What is 15% of 80?")).toBeInTheDocument();
    expect(screen.queryByText(/0\.15 multiplied by 80/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^check answer$/i })).toBeDisabled();
    answerTransfer("12");
    expect(screen.queryByText(/0\.15 multiplied by 80 equals 12/i)).not.toBeInTheDocument();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/0\.15 multiplied by 80 equals 12/i)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("record-study-result", expect.objectContaining({
      body: expect.objectContaining({
        artifactId: "artifact-1",
        selectedIndex: 2,
        confidence: "high",
      }),
    }));
    const body = invoke.mock.calls[0][1].body;
    expect(body.attemptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(body).not.toHaveProperty("correct");
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("perConcept");
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    expect(screen.getByText("Result saved")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((node) => (
      node.textContent?.includes("Assignment tutor result saved")
    ))).toBe(true);
    expect(sessionStorage.getItem(tutorStorageKey())).toBeNull();
  });

  it("retries a rejected save with the same id and unchanged transfer result", async () => {
    invoke
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { ok: true, sessionId: "session-1" }, error: null });
    renderRunner();
    reachTransferAttempt();
    answerTransfer("12", /somewhat sure/i);

    expect(await screen.findByRole("alert")).toHaveTextContent(/answer is still here/i);
    expect(sessionStorage.getItem(tutorStorageKey())).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /try checking again/i }));
    expect(await screen.findByText(/0\.15 multiplied by 80 equals 12/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    expect(screen.getByText("Result saved")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1].body).toEqual(invoke.mock.calls[0][1].body);
  });

  it("rebuilds a terminal challenge instead of replaying an attempt forever", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({
          error: "Build a new check before trying again.",
          reason: "challenge_unavailable",
          retryable: false,
        }), { status: 409, headers: { "Content-Type": "application/json" } }),
      },
    });
    const onOpenChange = vi.fn();
    const onFreshCheckRequired = vi.fn().mockResolvedValue(undefined);
    render(
      <AssignmentTutorRunner
        open
        onOpenChange={onOpenChange}
        artifact={artifact}
        assignmentId="assignment-1"
        captureId="capture-1"
        onFreshCheckRequired={onFreshCheckRequired}
      />,
    );
    reachTransferAttempt();
    answerTransfer("12");

    expect(await screen.findByRole("alert")).toHaveTextContent(/build a fresh check/i);
    expect(screen.queryByRole("button", { name: /try checking again/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /build a new check/i }));

    await waitFor(() => expect(onFreshCheckRequired).toHaveBeenCalledWith("challenge_unavailable"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(tutorStorageKey())).toBeNull();
  });

  it("freezes a wrong submitted answer after a lost response and replays only that body", async () => {
    invoke
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ data: { ok: true, sessionId: "session-1" }, error: null });
    renderRunner();
    reachTransferAttempt();
    answerTransfer("10", /somewhat sure/i);

    expect(await screen.findByRole("alert")).toHaveTextContent(/answer is still here/i);
    expect(screen.queryByRole("button", { name: /try this problem again/i })).not.toBeInTheDocument();

    const firstBody = invoke.mock.calls[0][1].body;
    fireEvent.click(screen.getByRole("button", { name: /try checking again/i }));
    expect(await screen.findByText(/0\.15 multiplied by 80 equals 12/i)).toBeInTheDocument();
    expect(invoke.mock.calls[1][1].body).toEqual(firstBody);
  });

  it("lets a student leave while a mobile save request never settles", async () => {
    invoke.mockReturnValueOnce(new Promise(() => undefined));
    const onOpenChange = vi.fn();
    renderRunner(onOpenChange);
    reachTransferAttempt();
    answerTransfer("12");

    fireEvent.click(await screen.findByRole("button", { name: /stop saving and leave/i }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(/leave assignment help/i);
    fireEvent.click(screen.getByRole("button", { name: /^leave session$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const snapshot = JSON.parse(sessionStorage.getItem(tutorStorageKey()) ?? "{}");
    expect(snapshot).toMatchObject({
      stage: "save-error",
      submissionLocked: true,
      submissionDurationSeconds: expect.any(Number),
    });
  });

  it("records the first miss before feedback and does not award a second mastery write on retry", async () => {
    renderRunner();
    reachTransferAttempt();
    answerTransfer("10");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/correct answer: 12/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try this problem again/i }));
    expect(screen.getByText(/try again from memory/i)).toBeInTheDocument();
    answerTransfer("12", /somewhat sure/i);
    expect(await screen.findByText(/0\.15 multiplied by 80 equals 12/i)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      firstSelectedIndex: 1,
      firstConfidence: "high",
      selectedIndex: 1,
      confidence: "high",
    });
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty("recovered");
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    expect(screen.getByText(/recovered after a miss/i)).toBeInTheDocument();
  });

  it("finishes a regenerated duplicate without presenting the prior attempt as a new score", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ok: true,
        outcome: "already-recorded",
        alreadyRecorded: true,
        reason: "challenge_already_recorded",
      },
      error: null,
    });
    const onCompleted = vi.fn();
    render(
      <AssignmentTutorRunner
        open
        onOpenChange={vi.fn()}
        artifact={artifact}
        assignmentId="assignment-1"
        captureId="capture-1"
        onCompleted={onCompleted}
      />,
    );
    reachTransferAttempt();
    answerTransfer("12");

    expect(await screen.findByText(/already counted toward readiness/i)).toBeInTheDocument();
    expect(screen.queryByText(/readiness is now/i)).not.toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    expect(screen.getByText("Already counted")).toBeInTheDocument();
    expect(sessionStorage.getItem(tutorStorageKey())).toBeNull();
  });

  it("warns before leaving and retains the answer-safe session snapshot", () => {
    const onOpenChange = vi.fn();
    renderRunner(onOpenChange);
    fireEvent.click(screen.getByRole("button", { name: /give me a hint/i }));
    fireEvent.click(screen.getByRole("button", { name: /end help session/i }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/leave assignment help/i);
    expect(screen.getByText(/place is saved in this tab/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /leave session/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    const raw = sessionStorage.getItem(tutorStorageKey()) ?? "";
    expect(raw).toContain('"helpUsed":["hint"]');
    expect(raw).not.toContain("answerIndex");
    expect(raw).not.toContain("sourceExcerpt");
    expect(raw).not.toContain("rationale");
  });

  it("restores the exact assignment stage after an unmount without posting evidence", () => {
    const first = renderRunner();
    reachOriginalAttempt();
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    first.unmount();

    renderRunner();
    expect(screen.getByText("What is 14% of 50?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
