import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CampusBrainInsightCard } from "./CampusBrainCard";

const insight = {
  kind: "noticed" as const,
  body: "Memory models are getting attention.",
  classId: "psych101",
};

describe("CampusBrainInsightCard peer prompt", () => {
  it("does not imply that an unfinished class invite is available", () => {
    renderCard();

    expect(screen.queryByText("More classmates = smarter insights.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite classmates" })).not.toBeInTheDocument();
  });
});

function renderCard() {
  return render(
    <MemoryRouter>
      <CampusBrainInsightCard insight={insight} />
    </MemoryRouter>,
  );
}
