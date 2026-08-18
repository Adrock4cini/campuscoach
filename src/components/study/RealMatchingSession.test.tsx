import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/components/study/RealMatchingGame", () => ({
  RealMatchingGame: ({ onComplete }: { onComplete: (value: unknown) => void }) => (
    <button type="button" onClick={() => onComplete({
      correctFirstAttempt: 2,
      total: 3,
      perConcept: [
        { conceptId: "concept-1", firstAttemptCorrect: false, recovered: true },
        { conceptId: "concept-2", firstAttemptCorrect: true, recovered: false },
        { conceptId: "concept-3", firstAttemptCorrect: true, recovered: false },
      ],
    })}>
      Complete matching
    </button>
  ),
}));

import { RealMatchingSession } from "./RealMatchingSession";

const artifact: LearningArtifact<"matching"> = {
  id: "artifact-match",
  user_id: "user-1",
  class_id: null,
  client_class_id: "biology",
  kind: "matching",
  concept_ids: ["concept-1", "concept-2", "concept-3"],
  capture_id: null,
  topic: null,
  study_scope_type: "class",
  study_scope_id: "class",
  study_scope_label: "Mixed class review",
  study_scope_snapshot: {},
  payload: {
    pairs: [
      { id: "1", conceptId: "concept-1", conceptName: "Cell", left: "Cell", right: "Basic unit" },
      { id: "2", conceptId: "concept-2", conceptName: "DNA", left: "DNA", right: "Genetic material" },
      { id: "3", conceptId: "concept-3", conceptName: "Gene", left: "Gene", right: "DNA segment" },
    ],
  },
  model: "test",
  prompt_version: "v9-study-intelligence",
  stale: false,
  created_at: "2026-08-17T00:00:00Z",
  updated_at: "2026-08-17T00:00:00Z",
};

describe("RealMatchingSession", () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({
      data: { ok: true, sessionId: "session-1" },
      error: null,
    });
  });

  it("saves first-attempt correctness and recovery without score inflation", async () => {
    render(<RealMatchingSession open onOpenChange={vi.fn()} artifact={artifact} />);

    fireEvent.click(screen.getByRole("button", { name: "Somewhat sure" }));
    fireEvent.click(screen.getByRole("button", { name: "Start matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Match Lab" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({
      artifactId: "artifact-match",
      correct: 2,
      total: 3,
      perConcept: [
        { conceptId: "concept-1", correct: false, confidence: "medium", recovered: true },
        { conceptId: "concept-2", correct: true, confidence: "medium", recovered: false },
        { conceptId: "concept-3", correct: true, confidence: "medium", recovered: false },
      ],
    });
    expect(await screen.findByText("Match Lab saved")).toBeInTheDocument();
  });

  it("does not celebrate an unconfirmed response and retries the same attempt", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { ok: false }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, sessionId: "session-1" }, error: null });
    render(<RealMatchingSession open onOpenChange={vi.fn()} artifact={artifact} />);
    fireEvent.click(screen.getByRole("button", { name: "Somewhat sure" }));
    fireEvent.click(screen.getByRole("button", { name: "Start matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Match Lab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still here/i);

    fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));
    expect(await screen.findByText("Match Lab saved")).toBeInTheDocument();
    expect(mocks.invoke.mock.calls[1][1].body.attemptId).toBe(mocks.invoke.mock.calls[0][1].body.attemptId);
  });

  it("warns before discarding an unfinished matching session", () => {
    const onOpenChange = vi.fn();
    render(<RealMatchingSession open onOpenChange={onOpenChange} artifact={artifact} />);
    fireEvent.click(screen.getByRole("button", { name: "Somewhat sure" }));
    fireEvent.click(screen.getByRole("button", { name: "Start matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/leave match lab/i);
  });
});
