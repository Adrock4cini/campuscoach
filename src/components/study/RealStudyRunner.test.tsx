import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealStudyRunner } from "./RealStudyRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({ data: { readiness: 42 }, error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const artifact: LearningArtifact<"flashcards"> = {
  id: "artifact-1",
  user_id: "user-1",
  class_id: "class-uuid",
  client_class_id: "math",
  kind: "flashcards",
  concept_ids: ["concept-1"],
  capture_id: "capture-1",
  topic: "Addition",
  study_scope_type: "recent",
  study_scope_id: "recent",
  study_scope_label: "Recent material",
  study_scope_snapshot: {},
  payload: {
    cards: [{
      front: "What does 2 + 2 equal?",
      back: "2 + 2 equals 4.",
      conceptId: "concept-1",
      conceptName: "Addition Facts",
      sourceExcerpt: "2+2 = 4",
    }],
  },
  model: "test",
  prompt_version: "v4-study-transparency",
  stale: false,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
};

const multipleChoiceArtifact: LearningArtifact<"multiple_choice"> = {
  ...artifact,
  id: "artifact-2",
  kind: "multiple_choice",
  payload: {
    questions: [{
      prompt: "What does 2 + 2 equal?",
      choices: ["3", "4", "5"],
      answerIndex: 1,
      rationale: "The source states that 2 + 2 equals 4.",
      conceptId: "concept-1",
    }],
  },
};

describe("real flashcard runner", () => {
  it("explains the mastery loop and waits to grade until the answer is revealed", () => {
    render(
      <RealStudyRunner
        open
        onOpenChange={vi.fn()}
        artifact={artifact}
      />,
    );

    expect(screen.getByText(/answer from memory first/i)).toBeInTheDocument();
    expect(screen.getByText("What does 2 + 2 equal?")).toBeInTheDocument();
    expect(screen.queryByText(/addition facts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/source from your notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText("2+2 = 4")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /i knew it/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end session/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));

    expect(screen.getByText("2 + 2 equals 4.")).toBeInTheDocument();
    expect(screen.getByText(/addition facts/i)).toBeInTheDocument();
    expect(screen.getByText(/source from your notes/i)).toHaveTextContent("2+2 = 4");
    expect(screen.getByRole("button", { name: /review again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /i knew it/i })).toBeInTheDocument();
  });

  it("waits for an explicit finish after the final card is rated", async () => {
    invoke.mockClear();
    render(
      <RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /i knew it/i }));

    expect(screen.getByText(/last card rated/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: /finish session/i })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(
      "record-study-result",
      expect.any(Object),
    ));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
  });

  it("shows the readiness gain so the final score is understandable", async () => {
    invoke.mockResolvedValueOnce({
      data: { readiness: 61, readinessDelta: 15 },
      error: null,
    });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />);

    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /i knew it/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText(/readiness/i)).toHaveTextContent("+15 points · now 61%");
  });

  it("leaves saving state and lets the student retry after a network rejection", async () => {
    invoke.mockRejectedValueOnce(new Error("offline"));
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />);

    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /i knew it/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/saving results/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/answers are still here/i);
    expect(screen.getByRole("button", { name: /try saving again/i })).toBeEnabled();
    expect(screen.queryByText("Session saved")).not.toBeInTheDocument();
  });

  it("retries the same final multiple-choice result without grading it twice", async () => {
    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { readiness: 42 }, error: null });
    render(
      <RealStudyRunner
        open
        onOpenChange={vi.fn()}
        artifact={multipleChoiceArtifact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/answers are still here/i);

    fireEvent.click(screen.getByRole("button", { name: /try saving again/i }));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();

    expect(invoke).toHaveBeenCalledTimes(2);
    for (const call of invoke.mock.calls) {
      expect(call[1].body).toMatchObject({ correct: 1, total: 1 });
    }
  });
});
