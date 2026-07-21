import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MyClasses from "./MyClasses";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [],
    isReal: true,
    loading: false,
    error: "Couldn’t load your classes. Your saved classes were not deleted.",
    reload: vi.fn(),
  }),
}));

describe("My Classes data trust", () => {
  it("shows a recoverable load error instead of an empty-semester setup", () => {
    render(
      <MemoryRouter>
        <MyClasses />
      </MemoryRouter>,
    );

    expect(screen.getByText("Couldn’t load your classes")).toBeInTheDocument();
    expect(screen.getByText(/saved classes were not deleted/i)).toBeInTheDocument();
    expect(screen.queryByText("Set up your semester")).not.toBeInTheDocument();
  });
});
