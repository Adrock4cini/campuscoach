import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RealMatchingGame } from "./RealMatchingGame";
import type {
  MatchingPayload,
  MatchingRightChoice,
} from "@/lib/learningArtifacts/matchingGame";

const payload: MatchingPayload = {
  pairs: [
    {
      id: "pair-1",
      conceptId: "concept-cells",
      conceptName: "Cell structures",
      left: "Mitochondria",
      right: "Produces usable cellular energy",
      sourceExcerpt: "Mitochondria generate ATP for the cell.",
    },
    {
      id: "pair-2",
      conceptId: "concept-cells",
      conceptName: "Cell structures",
      left: "Nucleus",
      right: "Stores most genetic material",
      sourceExcerpt: "The nucleus contains the cell's DNA.",
    },
    {
      id: "pair-3",
      conceptId: "concept-protein",
      conceptName: "Protein synthesis",
      left: "Ribosome",
      right: "Builds proteins",
      sourceExcerpt: "Ribosomes assemble amino acids into proteins.",
    },
  ],
};

const allowedConceptIds = ["concept-cells", "concept-protein"];
const reverse = (choices: readonly MatchingRightChoice[]) => [...choices].reverse();

function renderGame(onComplete = vi.fn(), gamePayload = payload) {
  return {
    onComplete,
    ...render(
      <RealMatchingGame
        payload={gamePayload}
        allowedConceptIds={allowedConceptIds}
        onComplete={onComplete}
        shuffle={reverse}
      />,
    ),
  };
}

function match(left: string, right: string) {
  fireEvent.click(screen.getByRole("button", { name: left }));
  fireEvent.click(screen.getByRole("button", { name: right }));
}

describe("RealMatchingGame", () => {
  it("uses the injected order and requires a left selection before answers activate", () => {
    renderGame();

    expect(screen.getByRole("heading", { name: "Match each term" })).toBeVisible();
    const answerGroup = screen.getByRole("heading", { name: /choose its match/i }).parentElement!;
    const answers = within(answerGroup).getAllByRole("button");
    expect(answers.map((button) => button.textContent)).toEqual([
      "Builds proteins",
      "Stores most genetic material",
      "Produces usable cellular energy",
    ]);
    answers.forEach((answer) => expect(answer).toBeDisabled());

    const term = screen.getByRole("button", { name: "Mitochondria" });
    expect(term).toHaveClass("min-h-11");
    expect(term).toHaveFocus();
    fireEvent.click(term);

    expect(term).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected", { selector: "span" })).toBeVisible();
    answers.forEach((answer) => expect(answer).toBeEnabled());
    expect(screen.getByText(/match for:/i)).toHaveTextContent("Match for: Mitochondria");
    expect(answers[0]).toHaveFocus();
  });

  it("does not emit or award completion before every pair is matched", () => {
    const { onComplete } = renderGame();

    match("Mitochondria", "Produces usable cellular energy");

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/matched pairs · 1 of 3/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mitochondria" })).not.toBeInTheDocument();
    expect(screen.getByText(/matched on the first try/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Nucleus" })).toHaveFocus();
  });

  it("preserves a first-attempt miss while letting the student recover", () => {
    const { onComplete } = renderGame();

    fireEvent.click(screen.getByRole("button", { name: "Mitochondria" }));
    fireEvent.click(screen.getByRole("button", { name: "Builds proteins" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not a match: Mitochondria does not match Builds proteins. Try another answer.",
    );
    expect(screen.getByRole("button", { name: /^Mitochondria/ })).toHaveAttribute("aria-pressed", "true");
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Produces usable cellular energy" }));
    expect(screen.getByText(/recovered after a retry/i)).toBeVisible();

    match("Nucleus", "Stores most genetic material");
    match("Ribosome", "Builds proteins");

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      correctFirstAttempt: 2,
      total: 3,
      perConcept: [
        {
          conceptId: "concept-cells",
          firstAttemptCorrect: false,
          recovered: true,
        },
        {
          conceptId: "concept-protein",
          firstAttemptCorrect: true,
          recovered: false,
        },
      ],
    });
    const completion = screen.getByText(/first-try recall: 2 of 3/i).parentElement!;
    expect(completion).toBeVisible();
    expect(completion).toHaveFocus();
  });

  it("emits completion exactly once even when the parent rerenders", () => {
    const onComplete = vi.fn();
    const view = renderGame(onComplete);

    match("Mitochondria", "Produces usable cellular energy");
    match("Nucleus", "Stores most genetic material");
    match("Ribosome", "Builds proteins");
    expect(onComplete).toHaveBeenCalledTimes(1);

    view.rerender(
      <RealMatchingGame
        payload={payload}
        allowedConceptIds={allowedConceptIds}
        onComplete={onComplete}
        shuffle={reverse}
      />,
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reveals grounded source material only after its pair is matched", () => {
    renderGame();

    expect(screen.queryByText(/mitochondria generate ATP/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review source for cell structures/i })).not.toBeInTheDocument();

    match("Mitochondria", "Produces usable cellular energy");
    const review = screen.getByRole("button", { name: /review source for cell structures/i });
    expect(review).toHaveClass("min-h-11");
    expect(review).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(review);
    expect(screen.getByText(/from your class material/i)).toHaveTextContent(
      "Mitochondria generate ATP for the cell.",
    );
    expect(screen.getByRole("button", { name: /hide source/i })).toHaveAttribute("aria-expanded", "true");
  });

  it.each([
    ["too few pairs", { pairs: payload.pairs.slice(0, 2) }],
    ["duplicate pair ids", { pairs: payload.pairs.map((pair, index) => index === 1 ? { ...pair, id: "pair-1" } : pair) }],
    ["empty answer", { pairs: payload.pairs.map((pair, index) => index === 1 ? { ...pair, right: "" } : pair) }],
    ["foreign concept", { pairs: payload.pairs.map((pair, index) => index === 1 ? { ...pair, conceptId: "foreign" } : pair) }],
  ])("fails closed with a visible unavailable state for %s", (_label, invalidPayload) => {
    const onComplete = vi.fn();
    renderGame(onComplete, invalidPayload as MatchingPayload);

    expect(screen.getByRole("heading", { name: /match lab unavailable/i })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be verified/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("fails closed if an injected shuffle drops or duplicates choices", () => {
    render(
      <RealMatchingGame
        payload={payload}
        allowedConceptIds={allowedConceptIds}
        onComplete={vi.fn()}
        shuffle={(choices) => [choices[0], choices[0], choices[1]]}
      />,
    );

    expect(screen.getByRole("heading", { name: /match lab unavailable/i })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be prepared safely/i);
  });
});
