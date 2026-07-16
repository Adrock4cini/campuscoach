import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealStudySet } from "./RealStudySet";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";

const mocks = vi.hoisted(() => ({
  artifact: null as LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice"> | null,
  generate: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/lib/learningArtifacts/useLearningArtifact", () => ({
  useLearningArtifact: () => ({
    artifact: mocks.artifact,
    loading: false,
    generating: false,
    error: null,
    generate: mocks.generate,
    reload: mocks.reload,
  }),
}));

function artifact(promptVersion: string): LearningArtifact<"flashcards"> {
  return {
    id: "artifact-1",
    user_id: "user-1",
    class_id: null,
    client_class_id: "math",
    kind: "flashcards",
    concept_ids: ["concept-1"],
    capture_id: "capture-1",
    topic: "Addition",
    payload: {
      cards: [{
        front: "What is 2 + 2?",
        back: "4",
        conceptId: "concept-1",
        conceptName: "2 + 2 = 4",
        sourceExcerpt: "2+2=4",
      }],
    },
    model: "deterministic-source",
    prompt_version: promptVersion,
    stale: false,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
  };
}

describe("real study set freshness", () => {
  beforeEach(() => {
    mocks.generate.mockClear();
    mocks.reload.mockClear();
  });

  it("blocks an older ungrounded set until it is refreshed", () => {
    mocks.artifact = artifact("v4-study-transparency");
    render(<RealStudySet classId="math" />);

    expect(screen.getByText("Refresh this set before studying")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh from notes/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /study now/i })).not.toBeInTheDocument();
  });

  it("allows a current grounded set to be studied", () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    expect(screen.getByRole("button", { name: /study now/i })).toBeInTheDocument();
    expect(screen.queryByText("Refresh this set before studying")).not.toBeInTheDocument();
  });

  it("blocks an older multiple-choice set until it is refreshed", () => {
    mocks.artifact = {
      ...artifact("v5-grounded-regeneration"),
      kind: "multiple_choice",
      payload: {
        questions: [{
          prompt: "Which example is an Addition Fact?",
          choices: ["2 + 2 = 4", "5 - 2 = 3"],
          answerIndex: 0,
          rationale: "Old generated wording",
        }],
      },
    } as LearningArtifact<"multiple_choice">;

    render(<RealStudySet classId="math" />);
    fireEvent.click(screen.getByRole("button", { name: /multiple choice/i }));

    expect(screen.getByText("Refresh this set before studying")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh from notes/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /study now/i })).not.toBeInTheDocument();
  });
});
