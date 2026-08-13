import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteClassmatesButton } from "./InviteClassmatesButton";

const auth = vi.hoisted(() => ({
  mode: "demo" as "demo" | "real" | "loading",
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: auth.mode }),
}));

vi.mock("@/lib/intelligence/aggregateSignals", () => ({
  useAggregateInsightsForClass: () => ({ insights: [], loading: false }),
}));

describe("InviteClassmatesButton account boundary", () => {
  beforeEach(() => {
    auth.mode = "demo";
  });

  it("does not offer share controls for a sample class", () => {
    render(<InviteClassmatesButton classId="psych101" className="Intro to Psychology" />);

    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/smarter study insights/i)).not.toBeInTheDocument();
  });

  it("keeps the invite flow available for a real class", () => {
    auth.mode = "real";
    render(<InviteClassmatesButton classId="real-class" className="Biology 101" />);

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Invite classmates to Biology 101" })).toBeInTheDocument();
  });
});
