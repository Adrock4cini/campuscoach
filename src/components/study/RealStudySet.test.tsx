import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealStudySet } from "./RealStudySet";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "@/lib/learningArtifacts/types";

const mocks = vi.hoisted(() => ({
  artifact: null as LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice"> | LearningArtifact<"matching"> | null,
  generate: vi.fn(),
  reload: vi.fn(),
  invoke: vi.fn(),
  scopes: [] as unknown[],
  captureProcessing: false,
  retryCaptureProcessing: vi.fn(),
  exams: [] as Array<{
    id: string;
    title: string;
    exam_date: string | null;
    topics: string[];
  }>,
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
    captureProcessing: mocks.captureProcessing,
    generate: mocks.generate,
    reload: mocks.reload,
    });
  },
}));

vi.mock("@/lib/supabase/capturePersistence", () => ({
  retryCaptureProcessing: (...args: unknown[]) => mocks.retryCaptureProcessing(...args),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealExams: () => ({
    items: mocks.exams,
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

function matchingArtifact(): LearningArtifact<"matching"> {
  return {
    ...artifact(CURRENT_ARTIFACT_PROMPT_VERSION),
    kind: "matching",
    concept_ids: ["concept-1", "concept-2", "concept-3"],
    payload: {
      pairs: [
        { id: "pair-1", conceptId: "concept-1", conceptName: "Addition", left: "2 + 2", right: "4" },
        { id: "pair-2", conceptId: "concept-2", conceptName: "Subtraction", left: "5 - 2", right: "3" },
        { id: "pair-3", conceptId: "concept-3", conceptName: "Multiplication", left: "3 × 2", right: "6" },
      ],
    },
  } as LearningArtifact<"matching">;
}

function rateFlashcardKnewIt() {
  fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
  fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  const knewIt = screen.getByRole("button", { name: /i knew it/i });
  expect(knewIt).toBeEnabled();
  fireEvent.click(knewIt);
}

describe("real study set freshness", () => {
  beforeEach(() => {
    mocks.exams = [{
      id: "exam-1",
      title: "Unit 1 Exam",
      exam_date: "2099-07-20",
      topics: ["Addition"],
    }];
    mocks.generate.mockReset().mockResolvedValue(null);
    mocks.reload.mockClear();
    mocks.invoke.mockReset().mockResolvedValue({
      data: { ok: true, sessionId: "session-1", readiness: 61, readinessDelta: 15 },
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

    expect(screen.getByRole("button", { name: /start study session/i })).toBeInTheDocument();
    expect(screen.queryByText("Refresh this set before studying")).not.toBeInTheDocument();
  });

  it("presents study formats as one accessible segmented choice", () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    expect(screen.getByRole("group", { name: "Study format" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flashcards" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Multiple choice" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Match Lab" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a grounded Match Lab set through the same study-set controls", () => {
    mocks.artifact = matchingArtifact();
    render(<RealStudySet classId="math" initialKind="matching" />);

    expect(screen.getByRole("button", { name: "Match Lab" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/3 pairs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start study session/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Match Lab" }).length).toBeGreaterThan(0);
  });

  it("condenses selection reasons and keeps the detail one tap away", () => {
    mocks.artifact = {
      ...artifact(CURRENT_ARTIFACT_PROMPT_VERSION),
      study_scope_snapshot: {
        selectionEvidence: [
          {
            conceptId: "concept-1",
            conceptName: "Cell division",
            signals: [{ label: "Named in the test topics" }, { label: "Review is due" }],
          },
          {
            conceptId: "concept-2",
            conceptName: "DNA",
            signals: [{ label: "Low mastery" }, { label: "Teacher emphasized it" }, { label: "Extra hidden reason" }],
          },
          { conceptId: "concept-3", conceptName: "RNA", signals: [{ label: "Not studied yet" }] },
          { conceptId: "concept-4", conceptName: "Protein", signals: [{ label: "Review is due" }] },
        ],
      },
    };

    render(<RealStudySet classId="math" />);

    expect(screen.getByText("4 concepts picked for this set")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.queryByText(/named in the test topics/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Why this set?" }));
    expect(screen.getByText("Cell division:").closest("li")).toHaveTextContent(
      "Cell division: Named in the test topics · Review is due",
    );
    expect(screen.getByText("DNA:").closest("li")).toHaveTextContent(
      "DNA: Low mastery · Teacher emphasized it",
    );
    expect(screen.queryByText(/extra hidden reason/i)).not.toBeInTheDocument();
  });

  it("states one shared reason once instead of repeating it per concept", () => {
    mocks.artifact = {
      ...artifact(CURRENT_ARTIFACT_PROMPT_VERSION),
      study_scope_snapshot: {
        type: "class",
        id: "class",
        selectionEvidence: [
          { conceptId: "concept-1", conceptName: "Cell division", signals: [{ label: "Spaced review is due" }] },
          { conceptId: "concept-2", conceptName: "DNA", signals: [{ label: "Spaced review is due" }] },
        ],
      },
    };

    render(<RealStudySet classId="math" />);

    expect(screen.getByText("2 concepts · spaced review is due")).toBeInTheDocument();
  });

  it("shows a truthful fallback reason for every selected class-review concept", () => {
    mocks.artifact = {
      ...artifact(CURRENT_ARTIFACT_PROMPT_VERSION),
      study_scope_snapshot: {
        type: "class",
        id: "class",
        selectionEvidence: [
          { conceptId: "concept-1", conceptName: "Cell division", signals: [] },
          { conceptId: "concept-2", conceptName: "DNA", signals: [{ label: "Review is due" }] },
        ],
      },
    };

    render(<RealStudySet classId="math" />);

    fireEvent.click(screen.getByRole("button", { name: "Why this set?" }));
    expect(screen.getByText("Cell division:").parentElement).toHaveTextContent(
      "Cell division: Included in mixed class review",
    );
    expect(screen.getByText("DNA:").parentElement).toHaveTextContent("DNA: Review is due");
  });


  it("keeps study-set provenance available without leaving it on screen", () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    expect(screen.queryByText(/Built from 1 concept extracted/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /about this study set/i }));
    expect(screen.getByText(/Built from 1 concept extracted/i)).toBeInTheDocument();
  });

  it("lets the student choose a specific assessment target", () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    expect(screen.getByText("Focus")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^test · unit 1 exam/i }));
    expect(screen.queryByText(/focuses on concepts linked to unit 1 exam/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /about unit 1 exam/i }));
    expect(screen.getByText(/focuses on concepts linked to unit 1 exam/i)).toBeInTheDocument();
    expect(screen.getByText("Your notes")).toBeInTheDocument();
  });

  it("offers future and undated tests without turning past tests into study targets", () => {
    mocks.exams = [
      ...mocks.exams,
      {
        id: "exam-past",
        title: "Old final",
        exam_date: "2000-05-10",
        topics: ["Subtraction"],
      },
      {
        id: "exam-tbd",
        title: "Pop quiz",
        exam_date: null,
        topics: ["Fractions"],
      },
    ];
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);

    render(<RealStudySet classId="math" />);

    expect(screen.getByRole("button", { name: /^Test · Unit 1 Exam/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test · Pop quiz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Old final/i })).not.toBeInTheDocument();
  });

  it("opens the exact exam selected from the academic calendar", () => {
    mocks.artifact = null;
    render(<RealStudySet classId="math" initialExamId="exam-1" />);

    expect(screen.getByRole("button", { name: /^test · unit 1 exam/i })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.scopes.at(-1)).toMatchObject({
      classId: "math",
      studyScope: { type: "exam", id: "exam-1", examId: "exam-1" },
    });
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

  it("automatically builds the exact concepts handed off by the coach", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /about coach picks/i }));
    expect(screen.getByText(/uses your mastery, review timing, teacher emphasis/i)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /about this capture/i }));
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

  it("does not let an old A generation cancel a newer C scope while repairing A → B → A", async () => {
    let resolveA!: (value: null) => void;
    const pendingA = new Promise<null>((resolve) => { resolveA = resolve; });
    mocks.artifact = null;
    mocks.generate
      .mockImplementationOnce(() => pendingA)
      .mockResolvedValue(null);

    const view = render(
      <RealStudySet classId="math" initialCaptureId="capture-a" autoStart />,
    );
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));

    view.rerender(<RealStudySet classId="math" initialCaptureId="capture-b" autoStart />);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));

    view.rerender(<RealStudySet classId="math" initialCaptureId="capture-a" autoStart />);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));

    view.rerender(<RealStudySet classId="math" initialCaptureId="capture-c" autoStart />);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveA(null);
      await pendingA;
    });

    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.scopes.at(-1)).toMatchObject({ captureId: "capture-c" });
  });

  it("keeps saved results open and reloads only after Done", async () => {
    mocks.artifact = artifact(CURRENT_ARTIFACT_PROMPT_VERSION);
    render(<RealStudySet classId="math" />);

    fireEvent.click(screen.getByRole("button", { name: /start study session/i }));
    rateFlashcardKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(mocks.reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});

describe("stuck capture recovery", () => {
  beforeEach(() => {
    mocks.artifact = null;
    mocks.captureProcessing = false;
    mocks.generate.mockReset().mockResolvedValue(undefined);
    mocks.retryCaptureProcessing.mockReset().mockResolvedValue("ready");
  });

  it("offers no retry while nothing is stuck", () => {
    render(<RealStudySet classId="math" kind="flashcards" captureId="capture-1" />);
    expect(screen.queryByRole("button", { name: /retry processing/i })).toBeNull();
  });

  it("lets the student reclaim a stuck capture and rebuild the set", async () => {
    mocks.captureProcessing = true;
    render(<RealStudySet classId="math" kind="flashcards" captureId="capture-1" />);

    fireEvent.click(screen.getByRole("button", { name: /retry processing/i }));

    await waitFor(() => {
      expect(mocks.retryCaptureProcessing).toHaveBeenCalledWith("capture-1");
    });
    await waitFor(() => {
      expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false });
    });
  });
});
