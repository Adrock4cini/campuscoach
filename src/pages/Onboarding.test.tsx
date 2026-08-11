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
  }) => {
    const importCourse = (course: {
      name: string;
      days: string[];
      time: string;
      semesterStartDate?: string;
      semesterEndDate?: string;
      examDates: { label: string; date: string }[];
      assignments: unknown[];
      schedule: unknown[];
    }) => {
      onMerge({ classes: [course] });
      onParsed?.({ classes: [course] });
    };

    return (
      <>
        <button
          type="button"
          onClick={() => importCourse({
            name: "Biology",
            days: ["Tue"],
            time: "9:00 AM",
            examDates: [{ label: "Midterm", date: "2026-10-10" }],
            assignments: [],
            schedule: [],
          })}
        >
          Read recurring syllabus
        </button>
        <button
          type="button"
          onClick={() => importCourse({
            name: "Biology",
            days: ["Tue"],
            time: "9:00 AM",
            semesterStartDate: "2026-08-24",
            semesterEndDate: "2026-12-12",
            examDates: [{ label: "Midterm", date: "2026-10-10" }],
            assignments: [],
            schedule: [],
          })}
        >
          Read bounded syllabus
        </button>
      </>
    );
  },
}));

describe("returning student syllabus import", () => {
  beforeEach(() => {
    mocks.saveOnboarding.mockReset().mockResolvedValue(undefined);
    mocks.refreshOnboarded.mockReset().mockResolvedValue(undefined);
  });

  it("requires term dates before saving a recurring imported class", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Read recurring syllabus" }));
    fireEvent.click(screen.getByRole("button", { name: /review schedule/i }));

    expect(await screen.findByRole("heading", { name: "Professor & schedule" })).toBeInTheDocument();
    expect(mocks.saveOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /save syllabus/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Term starts"), { target: { value: "2026-08-24" } });
    fireEvent.change(screen.getByLabelText("Term ends"), { target: { value: "2026-12-12" } });
    fireEvent.click(screen.getByRole("button", { name: /save syllabus/i }));

    await waitFor(() => expect(mocks.saveOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alex",
        school: "State University",
        term: "Fall 2026",
        classes: [expect.objectContaining({
          name: "Biology",
          semesterStartDate: "2026-08-24",
          semesterEndDate: "2026-12-12",
        })],
      }),
      "user-1",
    ));
    expect(await screen.findByText("Calendar destination")).toBeInTheDocument();
  });

  it("keeps the one-step save path when recurring term bounds were imported", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding?import=syllabus"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/calendar" element={<p>Calendar destination</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Read bounded syllabus" }));
    fireEvent.click(screen.getByRole("button", { name: /save syllabus/i }));

    await waitFor(() => expect(mocks.saveOnboarding).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Professor & schedule" })).not.toBeInTheDocument();
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
