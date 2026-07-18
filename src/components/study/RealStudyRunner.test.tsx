import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealStudyRunner } from "./RealStudyRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";

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

    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));

    expect(screen.getByText("2 + 2 equals 4.")).toBeInTheDocument();
    expect(screen.getByText(/addition facts/i)).toBeInTheDocument();
    expect(screen.getByText(/source from your notes/i)).toHaveTextContent("2+2 = 4");
    expect(screen.getByRole("button", { name: /review again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /i knew it/i })).toBeInTheDocument();
  });
});
