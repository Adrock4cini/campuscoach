import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyClasses from "./MyClasses";

const mocks = vi.hoisted(() => ({
  classes: [] as Array<Record<string, unknown>>,
  error: "Couldn’t load your classes. Your saved classes were not deleted." as string | null,
  reload: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
    isReal: true,
    loading: false,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

describe("My Classes data trust", () => {
  beforeEach(() => {
    mocks.classes = [];
    mocks.error = "Couldn’t load your classes. Your saved classes were not deleted.";
    mocks.reload.mockReset();
  });

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

  it("hides unknown class metadata instead of presenting placeholders", () => {
    mocks.error = null;
    mocks.classes = [{
      id: "math-1",
      name: "Math",
      professor: "TBD",
      location: "",
      days: [],
      time: "",
      color: "bg-primary",
      currentTopic: "Getting started",
      nextExamDate: "",
      readiness: 73,
      suggestedAction: "Add your first capture for this class",
      gradingWeights: [],
      chapters: [],
    }];

    render(
      <MemoryRouter>
        <MyClasses />
      </MemoryRouter>,
    );

    expect(screen.queryByText("TBD")).not.toBeInTheDocument();
    expect(screen.queryByText("Current: Getting started")).not.toBeInTheDocument();
    expect(screen.queryByText("chapters")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /degree path/i })).toHaveAttribute(
      "href",
      "/path-to-graduation",
    );
  });
});
