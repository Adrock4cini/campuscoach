import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding, { isOnboardingClassScheduleValid } from "./Onboarding";

const mocks = vi.hoisted(() => ({
  saveOnboarding: vi.fn(),
  refreshOnboarded: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: {} },
    profile: {
      display_name: "Alex",
      term: "Fall 2026",
      work_schedule: "",
      learner_type: "college",
      schools: { name: "State University" },
    },
    refreshOnboarded: mocks.refreshOnboarded,
  }),
}));

vi.mock("@/lib/onboarding/store", () => ({
  loadCachedOnboarding: () => null,
  saveOnboarding: mocks.saveOnboarding,
}));

describe("returning student syllabus import", () => {
  beforeEach(() => {
    mocks.saveOnboarding.mockReset().mockResolvedValue(undefined);
    mocks.refreshOnboarded.mockReset().mockResolvedValue(undefined);
  });

  it("routes returning students to choose the class that owns the syllabus", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding?import=syllabus"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/classes" element={<p>Choose the syllabus class</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Choose the syllabus class")).toBeInTheDocument();
    expect(mocks.saveOnboarding).not.toHaveBeenCalled();
  });
});

describe("onboarding class schedule boundaries", () => {
  it("requires semester dates before a weekly meeting can repeat", () => {
    expect(isOnboardingClassScheduleValid({
      name: "Biology",
      days: ["Mon", "Wed"],
      time: "9:00 AM",
    })).toBe(false);

    expect(isOnboardingClassScheduleValid({
      name: "Biology",
      days: ["Mon", "Wed"],
      time: "9:00 AM",
      semesterStartDate: "2026-08-24",
      semesterEndDate: "2026-12-12",
    })).toBe(true);
  });
});
