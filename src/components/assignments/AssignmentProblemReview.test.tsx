import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentProblemReview } from "./AssignmentProblemReview";
import type { AssignmentPracticeSource } from "@/lib/assignments/assignmentPracticeSource";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({
  invokeEdgeFunction: mocks.invoke,
}));

const needsReview = {
  status: "needs_review" as const,
  text: "What is 14% of 50?",
  version: 1,
  hash: null,
  confirmedAt: null,
};

const confirmed = {
  status: "confirmed" as const,
  text: "What is 19% of 50?",
  version: 2,
  hash: "a".repeat(64),
  confirmedAt: "2026-08-27T12:00:00.000Z",
};

function confirmationResponse(source = confirmed) {
  return {
    data: { ok: true, practiceSource: source },
    error: null,
  };
}

function renderReview(
  source: AssignmentPracticeSource = needsReview,
  onConfirmed = vi.fn(),
  onFallback = vi.fn(),
) {
  render(
    <AssignmentProblemReview
      captureId="capture-1"
      assignmentId="assignment-1"
      classId="math"
      source={source}
      onConfirmed={onConfirmed}
      onFallback={onFallback}
    />,
  );
  return onConfirmed;
}

describe("AssignmentProblemReview", () => {
  beforeEach(() => mocks.invoke.mockReset());

  it("makes the OCR text editable and confirms the student's corrected problem", async () => {
    mocks.invoke.mockResolvedValue(confirmationResponse());
    const onConfirmed = renderReview();

    const editor = screen.getByRole("textbox", { name: "Problem Campus Companion read" });
    fireEvent.change(editor, { target: { value: "What is 19% of 50?" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm for walkthrough" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith(
      "confirm-assignment-practice-source",
      {
        body: {
          captureId: "capture-1",
          assignmentId: "assignment-1",
          classId: "math",
          text: "What is 19% of 50?",
          expectedVersion: 1,
        },
      },
    ));
    expect(onConfirmed).toHaveBeenCalledWith(confirmed);
  });

  it("keeps the student's edit visible while confirmation is pending", async () => {
    let resolveConfirmation!: (result: ReturnType<typeof confirmationResponse>) => void;
    mocks.invoke.mockReturnValue(new Promise((resolve) => {
      resolveConfirmation = resolve;
    }));
    const onConfirmed = renderReview();

    const editor = screen.getByRole("textbox", { name: "Problem Campus Companion read" });
    fireEvent.change(editor, { target: { value: "Find 19% of 50?" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm for walkthrough" }));

    expect(editor).toHaveValue("Find 19% of 50?");
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    resolveConfirmation(confirmationResponse());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(confirmed));
  });

  it("shows confirmed text read-only until the student explicitly edits it", () => {
    renderReview(confirmed);

    expect(screen.getByText("Percent problem confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Problem Campus Companion read" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit problem" }));
    expect(screen.getByRole("textbox", { name: "Problem Campus Companion read" })).toHaveValue(
      "What is 19% of 50?",
    );
  });

  it("offers an honest class-study fallback when Tutor does not support the problem type", async () => {
    const onFallback = vi.fn();
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          error: "Tutor v1 supports one percent problem at a time.",
          reason: "unsupported_assignment_problem",
        }), { status: 422, headers: { "Content-Type": "application/json" } }),
      },
    });
    renderReview(needsReview, vi.fn(), onFallback);

    fireEvent.click(screen.getByRole("button", { name: "Confirm for walkthrough" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/supports one percent problem/i);
    fireEvent.click(screen.getByRole("button", { name: /study saved concepts instead/i }));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("routes a clearly unsupported problem to saved concepts without making a 422 request", () => {
    const onFallback = vi.fn();
    renderReview({
      ...needsReview,
      text: "Explain how photosynthesis moves energy through a plant.",
    }, vi.fn(), onFallback);

    expect(screen.getByText(/walkthroughs support one percent-of or percent-discount problem/i))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm for walkthrough" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Study saved concepts instead" }));

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("reopens a legacy confirmed row when its text is outside Tutor scope", () => {
    const onFallback = vi.fn();
    renderReview({
      ...confirmed,
      text: "Explain how photosynthesis moves energy through a plant.",
    }, vi.fn(), onFallback);

    expect(screen.getByText("Check the problem")).toBeInTheDocument();
    expect(screen.queryByText("Percent problem confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Problem Campus Companion read" })).toHaveValue(
      "Explain how photosynthesis moves energy through a plant.",
    );
    expect(screen.getByRole("button", { name: "Confirm for walkthrough" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Study saved concepts instead" }));

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
