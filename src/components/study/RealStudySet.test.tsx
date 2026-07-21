import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealStudySet } from "./RealStudySet";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";

const mocks = vi.hoisted(() => ({
  artifact: null as LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice"> | null,
  generate: vi.fn(),
  reload: vi.fn(),
  invoke: vi.fn(),
  scopes: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/lib/learningArtifacts/useLearningArtifact", () => ({
  useLearningArtifact: (_kind: unknown, scope: unknown) => {
    mocks.scopes.push(scope);
    return ({
    artifact: mocks.artifact,
    loading: false,
    generating: false,
    error: null,
    generate: mocks.generate,
    reload: mocks.reload,
    });
  },
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealExams: () => ({
    items: [{
      id: "exam-1",
      title: "Unit 1 Exam",
      exam_date: "2026-07-20",
      topics: ["Addition"],
    }],
    loading: false,
    reload: vi.fn(),
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
    study_scope_type: "recent",
    study_scope_id: "recent",
    study_scope_label: "Recent material",
    study_scope_snapshot: {},
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
    mocks.generate.mockReset().mockResolvedValue(null);
    mocks.reload.mockClear();
    mocks.invoke.mockReset().mockResolvedValue({
      data: { readiness: 61, readinessDelta: 15 },
      error: null,
    });
    mocks.scopes.length = 0;
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

  it("lets the student choose a specific assessment target", () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    expect(screen.getByText("Choose what to study")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /unit 1 exam/i }));
    expect(screen.getByText("Only material for Unit 1 Exam will be included.")).toBeInTheDocument();
    expect(screen.getByText("Built from your notes")).toBeInTheDocument();
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

  it("automatically builds the exact concepts handed off by Campus Coach", async () => {
    mocks.artifact = null;
    render(
      <RealStudySet
        classId="math"
        initialConceptIds={["11111111-1111-4111-8111-111111111111"]}
        initialStudyScope={{ type: "class", id: "coach-abc", label: "Coach picks" }}
        autoStart
      />,
    );

    expect(screen.getByRole("button", { name: "Coach picks" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/weak, overdue, and high-impact concepts/i)).toBeInTheDocument();
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false }));
  });

  it("keeps a capture handoff limited to that capture", async () => {
    mocks.artifact = null;
    render(
      <RealStudySet
        classId="math"
        initialCaptureId="capture-1"
        initialKind="multiple_choice"
        autoStart
      />,
    );

    expect(screen.getByRole("button", { name: "This capture" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/only concepts extracted from this capture/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /multiple choice/i })).toHaveClass("text-primary");
    expect(mocks.scopes.at(-1)).toMatchObject({
      classId: "math",
      captureId: "capture-1",
      studyScope: { type: "recent", id: "capture-capture-1" },
    });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false }));
  });

  it("ignores a rapid second build tap for the same study target", () => {
    mocks.artifact = null;
    render(<RealStudySet classId="math" />);

    const build = screen.getByRole("button", { name: /build study set/i });
    fireEvent.click(build);
    fireEvent.click(build);

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false });
  });

  it("keeps saved results open and reloads only after Done", async () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    fireEvent.click(screen.getByRole("button", { name: /study now/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /i knew it/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(mocks.reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
