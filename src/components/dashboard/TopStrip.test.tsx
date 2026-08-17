import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TopStrip } from "./TopStrip";

vi.mock("@/lib/intelligence", () => ({
  useMomentum: () => ({ trend: "steady", score: 60, streak: 2, line: "Keep going" }),
}));

vi.mock("@/components/CommandPalette", () => ({
  useCommandPalette: () => ({ setOpen: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isDemoMode: false,
    user: { email: "student@example.com" },
    profile: { display_name: "Student" },
    mode: "real",
  }),
}));

describe("dashboard top strip", () => {
  it("keeps search comfortable to tap and does not promise unfinished notifications", () => {
    render(
      <MemoryRouter>
        <TopStrip />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Search" })).toHaveClass("h-11", "w-11");
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  });
});
