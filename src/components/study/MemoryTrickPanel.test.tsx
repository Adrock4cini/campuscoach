import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTrickPanel, type MemoryTrickPanelProps } from "./MemoryTrickPanel";

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  generate: vi.fn(),
  reload: vi.fn(),
  state: {
    artifact: null as unknown,
    loading: false,
    generating: false,
    error: null as string | null,
  },
}));

vi.mock("@/lib/learningArtifacts/useLearningArtifact", () => ({
  useLearningArtifact: (kind: unknown, scope: unknown) => {
    mocks.hook(kind, scope);
    return {
      ...mocks.state,
      generate: mocks.generate,
      reload: mocks.reload,
    };
  },
}));

const baseProps: MemoryTrickPanelProps = {
  conceptId: "concept-desert",
  conceptName: "Desert vs. dessert",
  exactTarget: "Dessert has two s's; desert has one.",
  sourceExcerpt: "A dessert is a sweet course served after a meal.",
  classId: "english",
  studyScope: { type: "exam", id: "exam-1", label: "Vocabulary test" },
};

function mnemonicArtifact(conceptId = "concept-desert", classId = "english") {
  return {
    id: `artifact-${conceptId}`,
    kind: "mnemonic",
    prompt_version: "v9-study-intelligence",
    stale: false,
    client_class_id: classId,
    study_scope_type: "exam",
    study_scope_id: "exam-1",
    concept_ids: [conceptId],
    payload: {
      items: [{
        id: `item-${conceptId}`,
        conceptId,
        conceptName: "Desert vs. dessert",
        target: "Dessert has two s's; desert has one.",
        mnemonic: "Dessert has two s's because you want seconds.",
        technique: "association",
        origin: "ai_created",
        explanation: "Connect the second s in dessert with asking for seconds.",
        sourceExcerpt: "A dessert is a sweet course served after a meal.",
      }],
    },
  };
}

describe("MemoryTrickPanel", () => {
  beforeEach(() => {
    mocks.hook.mockClear();
    mocks.generate.mockReset().mockResolvedValue(null);
    mocks.reload.mockReset().mockResolvedValue(undefined);
    mocks.state.artifact = null;
    mocks.state.loading = false;
    mocks.state.generating = false;
    mocks.state.error = null;
  });

  it("makes zero artifact calls until the student explicitly opens it", () => {
    render(<MemoryTrickPanel {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Make it stick" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveClass("min-h-11");
    expect(mocks.hook).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("loads an existing one-concept artifact and separates truth from the trick", async () => {
    mocks.state.artifact = mnemonicArtifact();
    render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    expect(mocks.hook).toHaveBeenCalledWith("mnemonic", {
      classId: "english",
      captureId: undefined,
      conceptIds: ["concept-desert"],
      topic: "Desert vs. dessert",
      studyScope: baseProps.studyScope,
    });
    expect(screen.getByTestId("academic-grounding")).toHaveTextContent(baseProps.exactTarget);
    expect(screen.getByTestId("academic-grounding")).toHaveTextContent(baseProps.sourceExcerpt);
    expect(screen.getByTestId("memory-trick-result")).toHaveTextContent("Dessert has two s's because you want seconds.");
    expect(screen.getByText("Memory hook · Association")).toBeInTheDocument();
    expect(screen.getByText("How to use it")).toBeInTheDocument();
    expect(screen.getByText("Quick self-check")).toBeInTheDocument();
    expect(screen.queryByText("artifact-concept-desert")).not.toBeInTheDocument();
    expect(screen.queryByText("concept-desert")).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole("region")).toHaveFocus());
  });

  it("preserves an exact capture boundary when a flashcard came from one capture", async () => {
    render(
      <MemoryTrickPanel
        {...baseProps}
        captureId="capture-1"
        studyScope={{ type: "recent", id: "capture-capture-1", label: "This capture" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    expect(mocks.hook).toHaveBeenCalledWith("mnemonic", expect.objectContaining({
      captureId: "capture-1",
      conceptIds: ["concept-desert"],
      studyScope: { type: "recent", id: "capture-capture-1", label: "This capture" },
    }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false, count: 1 }));
  });

  it("hides the fact and trick before asking for retrieval", async () => {
    mocks.state.artifact = mnemonicArtifact();
    render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    fireEvent.click(screen.getByRole("button", { name: /test myself without looking/i }));
    expect(screen.queryByTestId("academic-grounding")).not.toBeInTheDocument();
    expect(screen.queryByText(/because you want seconds/i)).not.toBeInTheDocument();
    expect(screen.getByText(/without looking, what do you need to remember/i)).toBeInTheDocument();
    expect(screen.queryByText(baseProps.exactTarget)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Quick self-check")).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByRole("status")).toHaveTextContent(baseProps.exactTarget);
  });

  it("generates exactly one mnemonic when no existing artifact is available", async () => {
    render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith({ regenerate: false, count: 1 });
  });

  it("fails closed with a generic error and retries the failed load", () => {
    mocks.state.error = "learning_artifacts permission denied for user-secret-123";
    render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t safely build a memory trick");
    expect(screen.queryByText(/permission denied|user-secret/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("uses 44px controls, live status, and an accessible disclosure", () => {
    mocks.state.loading = true;
    render(<MemoryTrickPanel {...baseProps} />);
    const trigger = screen.getByRole("button", { name: "Make it stick" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", screen.getByRole("region").id);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveClass("min-h-11");
  });

  it("exposes feedback callbacks without treating a view as mastery", async () => {
    const onHelpful = vi.fn();
    const onTryAnother = vi.fn();
    mocks.state.artifact = mnemonicArtifact();
    render(<MemoryTrickPanel {...baseProps} onHelpful={onHelpful} onTryAnother={onTryAnother} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    expect(onHelpful).not.toHaveBeenCalled();
    expect(screen.getByText(/doesn’t change mastery/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(onHelpful).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: "artifact-concept-desert",
      conceptId: "concept-desert",
      classId: "english",
      origin: "ai_created",
      technique: "association",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Try another way" }));
    fireEvent.click(screen.getByRole("button", { name: "A different memory trick" }));
    expect(onTryAnother).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({
      regenerate: true,
      count: 1,
      rejectFamilies: ["association"],
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try another way" })).toBeEnabled());
  });

  it("collapses every alternative behind one umbrella control", async () => {
    mocks.state.artifact = mnemonicArtifact();
    const onTryAnother = vi.fn();
    render(<MemoryTrickPanel {...baseProps} onTryAnother={onTryAnother} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));

    // Only one "another way" style control is visible before expanding.
    expect(screen.queryByLabelText("Other ways to learn this")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show me another way/i })).not.toBeInTheDocument();
    const umbrella = screen.getAllByRole("button", { name: /another way/i });
    expect(umbrella).toHaveLength(1);
    expect(umbrella[0]).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(umbrella[0]);
    const menu = screen.getByLabelText("Other ways to learn this");
    const actions = within(menu).getAllByRole("button");
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(3);
    expect(actions.every((button) => button.className.includes("min-h-11"))).toBe(true);

    fireEvent.click(actions[0]);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ regenerate: true, count: 1, strategyId: expect.any(String) }),
    ));
  });

  it("never labels a text-only strategy as a generated picture", () => {
    mocks.state.artifact = mnemonicArtifact();
    render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another way" }));

    const menu = screen.getByLabelText("Other ways to learn this");
    for (const button of within(menu).getAllByRole("button")) {
      expect(button.textContent ?? "").not.toMatch(/picture|image|photo/i);
    }
  });

  it("hides the old result and returns to a zero-call gate on a prop switch", () => {
    mocks.state.artifact = mnemonicArtifact();
    const { rerender } = render(<MemoryTrickPanel {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it stick" }));
    expect(screen.getByText(/because you want seconds/i)).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenCalledTimes(1);

    mocks.state.artifact = mnemonicArtifact("concept-mitosis", "biology");
    rerender(
      <MemoryTrickPanel
        {...baseProps}
        conceptId="concept-mitosis"
        conceptName="Mitosis phases"
        exactTarget="Mitosis proceeds through prophase, metaphase, anaphase, and telophase."
        sourceExcerpt="PMAT gives the order of the four mitosis phases."
        classId="biology"
      />,
    );

    expect(screen.queryByText(/because you want seconds/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make it stick" })).toHaveAttribute("aria-expanded", "false");
    expect(mocks.hook).toHaveBeenCalledTimes(1);
  });
});
