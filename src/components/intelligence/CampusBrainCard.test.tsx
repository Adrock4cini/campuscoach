import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampusBrainInsightCard } from "./CampusBrainCard";

const auth = vi.hoisted(() => ({
  mode: "demo" as "demo" | "real" | "loading",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: auth.mode }),
}));

vi.mock("@/components/invite/InviteClassmatesButton", () => ({
  InviteClassmatesButton: () => <button>Invite classmates</button>,
}));

const insight = {
  kind: "noticed" as const,
  body: "Memory models are getting attention.",
  classId: "psych101",
};

describe("CampusBrainInsightCard peer prompt", () => {
  beforeEach(() => {
    auth.mode = "demo";
  });

  it("does not imply a joinable class community for sample insights", () => {
    renderCard();

    expect(screen.queryByText("More classmates = smarter insights.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite classmates" })).not.toBeInTheDocument();
  });

  it("keeps the peer-growth prompt for a real class", () => {
    auth.mode = "real";
    renderCard();

    expect(screen.getByText("More classmates = smarter insights.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite classmates" })).toBeInTheDocument();
  });
});

function renderCard() {
  return render(
    <MemoryRouter>
      <CampusBrainInsightCard insight={insight} />
    </MemoryRouter>,
  );
}
