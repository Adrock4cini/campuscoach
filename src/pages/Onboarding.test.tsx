import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/components/onboarding/SyllabusImport", () => ({
  SyllabusImport: ({ onMerge, onParsed }: {
    onMerge: (patch: unknown) => void;
    onParsed?: (parsed: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        const course = {
          name: "Biology",
          days: ["Tue"],
          time: "9:00 AM",
          examDates: [{ label: "Midterm", date: "2026-10-10" }],
          assignments: [],
          schedule: [],
        };
        onMerge({ classes: [course] });
        onParsed?.({ classes: [course] });
      }}
    >
      Read syllabus
    </button>
  ),
}));

describe("returning student syllabus import", () => {
  beforeEach(() => {
    mocks.saveOnboarding.mockReset().mockResolvedValue(undefined);
    mocks.refreshOnboarded.mockReset().mockResolvedValue(undefined);
  });

  it("uses a one-step review-and-save path and returns to the real calendar", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding?import=syllabus"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/calendar" element={<p>Calendar destination</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Import a syllabus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Read syllabus" }));
    fireEvent.click(screen.getByRole("button", { name: /save syllabus/i }));

    await waitFor(() => expect(mocks.saveOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alex",
        school: "State University",
        term: "Fall 2026",
        classes: [expect.objectContaining({ name: "Biology" })],
      }),
      "user-1",
    ));
    expect(await screen.findByText("Calendar destination")).toBeInTheDocument();
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
