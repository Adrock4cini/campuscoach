import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealStudyRunner } from "./RealStudyRunner";
import type { LearningArtifact } from "@/lib/learningArtifacts/types";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({
    data: { ok: true, sessionId: "session-1", readiness: 42 },
    error: null,
  }),
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
  prompt_version: "v9-study-intelligence",
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
      choices: ["3", "4", "5", "6"],
      answerIndex: 1,
      rationale: "The source states that 2 + 2 equals 4.",
      conceptId: "concept-1",
      conceptName: "Addition Facts",
      sourceExcerpt: "2+2 = 4",
    }],
  },
};

const twoCardArtifact: LearningArtifact<"flashcards"> = {
  ...artifact,
  id: "artifact-two",
  concept_ids: ["concept-1", "concept-2"],
  payload: {
    cards: [
      artifact.payload.cards[0],
      {
        front: "What does 3 + 3 equal?",
        back: "3 + 3 equals 6.",
        conceptId: "concept-2",
        conceptName: "Addition Facts",
        sourceExcerpt: "3+3 = 6",
      },
    ],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function rateKnewIt() {
  fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
  fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
  const knewIt = screen.getByRole("button", { name: /i knew it/i });
  expect(knewIt).toBeEnabled();
  fireEvent.click(knewIt);
}

function rateMcCorrectAndFinish() {
  fireEvent.click(screen.getByRole("button", { name: /^4/ }));
  fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
  fireEvent.click(screen.getByRole("button", { name: /check answer/i }));
  const finish = screen.getByRole("button", { name: "Finish" });
  expect(finish).toBeEnabled();
  fireEvent.click(finish);
  fireEvent.click(screen.getByRole("button", { name: /finish session/i }));
}

describe("real flashcard runner", () => {
  it("captures confidence before revealing or grading the answer", () => {
    render(
      <RealStudyRunner
        open
        onOpenChange={vi.fn()}
        artifact={artifact}
      />,
    );

    expect(screen.getByText(/choose how sure you are before checking/i)).toBeInTheDocument();
    expect(screen.getByText("What does 2 + 2 equal?")).toBeInTheDocument();
    expect(screen.queryByText(/addition facts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/source from your notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText("2+2 = 4")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /i knew it/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end session/i })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /reveal answer/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /somewhat sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));

    expect(screen.getByText("2 + 2 equals 4.")).toBeInTheDocument();
    expect(screen.getByText(/addition facts/i)).toBeInTheDocument();
    expect(screen.getByText(/source from your notes/i)).toHaveTextContent("2+2 = 4");
    expect(screen.getByRole("button", { name: /i knew it/i })).toBeEnabled();
    expect(screen.getByTestId("study-feedback")).toHaveFocus();
  });

  it("waits for an explicit finish after the final card is rated", async () => {
    invoke.mockClear();
    render(
      <RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    rateKnewIt();

    expect(screen.getByText(/practice complete/i)).toBeInTheDocument();
    expect(screen.getByText(/practice complete/i).parentElement).toHaveFocus();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: /finish session/i })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(
      "record-study-result",
      expect.any(Object),
    ));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Study results saved");
  });

  it("shows the readiness gain so the final score is understandable", async () => {
    invoke.mockResolvedValueOnce({
      data: { ok: true, sessionId: "session-1", readiness: 61, readinessDelta: 15 },
      error: null,
    });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />);

    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText(/readiness/i)).toHaveTextContent("+15 points · now 61%");
  });

  it("leaves saving state and lets the student retry after a network rejection", async () => {
    invoke.mockRejectedValueOnce(new Error("offline"));
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />);

    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    await waitFor(() => {
      expect(screen.queryByText(/saving results/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/answers are still on this screen/i);
    expect(screen.getByRole("button", { name: /try saving again/i })).toBeEnabled();
    expect(screen.queryByText("Session saved")).not.toBeInTheDocument();
  });

  it("retries the same final multiple-choice result without grading it twice", async () => {
    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        data: { ok: true, sessionId: "session-1", readiness: 42 },
        error: null,
      });
    render(
      <RealStudyRunner
        open
        onOpenChange={vi.fn()}
        artifact={multipleChoiceArtifact}
      />,
    );

    rateMcCorrectAndFinish();
    expect(await screen.findByRole("alert")).toHaveTextContent(/answers are still on this screen/i);

    fireEvent.click(screen.getByRole("button", { name: /try saving again/i }));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Study results saved"));

    expect(invoke).toHaveBeenCalledTimes(2);
    const attemptIds = invoke.mock.calls.map((call) => call[1].body.attemptId);
    expect(attemptIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(attemptIds[1]).toBe(attemptIds[0]);
    for (const call of invoke.mock.calls) {
      expect(call[1].body).toMatchObject({
        correct: 1,
        total: 1,
        perConcept: [{ conceptId: "concept-1", firstSelectedIndex: 1 }],
      });
    }
  });

  it("retries a lost incremental response with the exact same attempt before finishing", async () => {
    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        data: { ok: true, sessionId: "segment-1", readiness: 30 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, sessionId: "segment-2", readiness: 42 },
        error: null,
      });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);

    rateKnewIt();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(3);
    const firstBody = invoke.mock.calls[0][1].body;
    const retriedBody = invoke.mock.calls[1][1].body;
    const finalBody = invoke.mock.calls[2][1].body;
    expect(retriedBody).toBe(firstBody);
    expect(retriedBody.attemptId).toBe(firstBody.attemptId);
    expect(finalBody.attemptId).not.toBe(firstBody.attemptId);
    expect(retriedBody.studyRunId).toBe(firstBody.studyRunId);
    expect(finalBody.studyRunId).toBe(firstBody.studyRunId);
    expect(firstBody).toMatchObject({ segmentIndex: 0, segmentFinal: false });
    expect(finalBody).toMatchObject({ segmentIndex: 1, segmentFinal: true });
    expect(firstBody).toMatchObject({
      correct: 1,
      total: 1,
      perConcept: [{ conceptId: "concept-1", correct: true }],
    });
    expect(finalBody).toMatchObject({
      correct: 1,
      total: 1,
      perConcept: [{ conceptId: "concept-2", correct: true }],
    });
  });

  it("waits for an in-flight segment and never overlaps it with the final save", async () => {
    invoke.mockClear();
    const firstResponse = deferred<{
      data: { ok: true; sessionId: string; readiness: number };
      error: null;
    }>();
    invoke
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce({
        data: { ok: true, sessionId: "segment-2", readiness: 42 },
        error: null,
      });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);

    rateKnewIt();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    // Finish joined the active request instead of starting another one.
    expect(invoke).toHaveBeenCalledTimes(1);
    const storedBeforeAcknowledgement = JSON.parse(
      window.sessionStorage.getItem("campus-coach:study-runner") ?? "{}",
    );
    expect(storedBeforeAcknowledgement.evidenceOutbox.pending).toHaveLength(2);
    expect(storedBeforeAcknowledgement.evidenceOutbox.pending[1].body).toMatchObject({
      segmentIndex: 1,
      segmentFinal: true,
      attemptId: storedBeforeAcknowledgement.evidenceOutbox.pending[1].attemptId,
    });
    await act(async () => {
      firstResponse.resolve({
        data: { ok: true, sessionId: "segment-1", readiness: 30 },
        error: null,
      });
      await firstResponse.promise;
    });

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(invoke.mock.calls.map((call) => call[1].body.perConcept[0].conceptId)).toEqual([
      "concept-1",
      "concept-2",
    ]);
  });

  it("restores an unresolved miss and saves its later recovery in the same evidence segment", async () => {
    invoke.mockClear();
    const firstMount = render(
      <RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /review again/i }));
    expect(screen.getByText("What does 3 + 3 equal?")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    firstMount.unmount();
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);
    expect(screen.getByText("What does 3 + 3 equal?")).toBeInTheDocument();

    rateKnewIt();
    expect(screen.getByText("What does 2 + 2 equal?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /guessing/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /got it this time/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      segmentIndex: 0,
      segmentFinal: true,
      correct: 1,
      total: 2,
      perConcept: [
        { conceptId: "concept-1", correct: false, recovered: true },
        { conceptId: "concept-2", correct: true, recovered: false },
      ],
    });
  });

  it("reports readiness gained across the whole incremental run", async () => {
    invoke.mockClear();
    invoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          sessionId: "logical-session",
          readiness: 25,
          readinessBefore: 20,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          sessionId: "logical-session",
          readiness: 31,
          readinessDelta: 6,
        },
        error: null,
      });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);

    rateKnewIt();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    expect(await screen.findByText(/readiness/i)).toHaveTextContent("+11 points · now 31%");
    expect(invoke.mock.calls[0][1].body.studyRunId).toBe(invoke.mock.calls[1][1].body.studyRunId);
  });

  it("sends delta time per segment instead of cumulative run time", async () => {
    invoke.mockClear();
    const dateNow = vi.spyOn(Date, "now");
    let now = 1_000_000;
    dateNow.mockImplementation(() => now);
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);

    now += 5_000;
    rateKnewIt();
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    now += 7_000;
    rateKnewIt();
    now += 20_000;
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();

    expect(invoke.mock.calls[0][1].body.durationSeconds).toBe(5);
    expect(invoke.mock.calls[1][1].body.durationSeconds).toBe(7);
    dateNow.mockRestore();
  });

  it("uses mobile-sized choices and labels correctness without relying on color", () => {
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={multipleChoiceArtifact} />);

    const wrong = screen.getByRole("button", { name: "3" });
    expect(wrong).toHaveClass("min-h-11");
    fireEvent.click(wrong);
    expect(screen.queryByText(/your answer/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    expect(screen.getByRole("button", { name: /3.*your answer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4.*correct answer/i })).toBeInTheDocument();
    expect(screen.getByTestId("study-feedback")).toHaveTextContent("Not quite. Correct answer: 4");
    expect(screen.getByTestId("study-feedback")).toHaveTextContent("Check the source: “2+2 = 4”");
    expect(screen.getByTestId("study-feedback")).toHaveFocus();
  });

  it("announces a correct multiple-choice outcome in the focused feedback", () => {
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={multipleChoiceArtifact} />);

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: /somewhat sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /check answer/i }));

    expect(screen.getByTestId("study-feedback")).toHaveTextContent(/^Correct\./);
    expect(screen.getByTestId("study-feedback")).toHaveFocus();
  });

  it("warns before closing a session with unsaved answers", () => {
    const onOpenChange = vi.fn();
    render(
      <RealStudyRunner
        open
        onOpenChange={onOpenChange}
        artifact={artifact}
      />,
    );

    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/leave study session/i);
    expect(screen.getByText(/nothing to lose|progress so far is saved/i)).toBeInTheDocument();
  });

  it("returns a miss once and saves the first-attempt score plus recovery", async () => {
    invoke.mockClear();
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={twoCardArtifact} />);

    fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /review again/i }));

    expect(screen.getByText("What does 3 + 3 equal?")).toBeInTheDocument();
    expect(screen.getByLabelText("Question 2: What does 3 + 3 equal?")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /somewhat sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /i knew it/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/quick retry/i);
    expect(screen.getByText("What does 2 + 2 equal?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /guessing/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole("button", { name: /got it this time/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      correct: 1,
      total: 2,
      perConcept: [
        { conceptId: "concept-1", correct: false, confidence: "high", recovered: true },
        { conceptId: "concept-2", correct: true, confidence: "medium", recovered: false },
      ],
    });
  });

  it("does not celebrate a response unless the durable completion is acknowledged", async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false }, error: null });
    render(<RealStudyRunner open onOpenChange={vi.fn()} artifact={artifact} />);
    rateKnewIt();
    fireEvent.click(screen.getByRole("button", { name: /finish session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/answers are still on this screen/i);
    expect(screen.queryByText("Session saved")).not.toBeInTheDocument();
  });
});

describe("RealStudyRunner presentation", () => {
  it("asks for silent recall instead of a typed answer the UI cannot accept", () => {
    render(
      <RealStudyRunner
        open
        onOpenChange={vi.fn()}
        artifact={{
          ...artifact,
          id: "artifact-own-words",
          payload: {
            cards: [{
              front: "Explain Muscles of the Hand in your own words.",
              back: "PART 1 Nail Technology Foundations The intrinsic muscles move the fingers.",
              conceptId: "concept-1",
              conceptName: "Muscles of the Hand",
              sourceExcerpt: "The intrinsic muscles move the fingers.",
            }],
          },
        }}
      />,
    );

    expect(screen.getByText("What do you remember about Muscles of the Hand?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/answer in your head or out loud/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /very sure/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal answer/i }));
    expect(
      screen.getByText("Nail Technology Foundations The intrinsic muscles move the fingers."),
    ).toBeInTheDocument();
  });
});
