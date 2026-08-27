import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding, {
  ONBOARDING_STEPS,
  isOnboardingClassScheduleValid,
  isOnboardingIdentityValid,
} from "./Onboarding";

const mocks = vi.hoisted(() => ({
  saveOnboarding: vi.fn(),
  cacheOnboardingDraft: vi.fn(),
  refreshOnboarded: vi.fn(),
  lastRoute: null as string | null,
  profile: {
    display_name: "Alex",
    term: "Fall 2026",
    work_schedule: "",
    learner_type: "college" as string | null,
    schools: { name: "State University" } as { name: string } | null,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", user_metadata: {} },
    profile: mocks.profile,
    refreshOnboarded: mocks.refreshOnboarded,
  }),
}));

vi.mock("@/lib/onboarding/store", () => ({
  loadCachedOnboarding: () => null,
  cacheOnboardingDraft: mocks.cacheOnboardingDraft,
  saveOnboarding: mocks.saveOnboarding,
}));

vi.mock("@/lib/app/routeMemory", () => ({
  readLastRoute: () => mocks.lastRoute,
}));

describe("returning student syllabus import", () => {
  beforeEach(() => {
    mocks.saveOnboarding.mockReset().mockResolvedValue(undefined);
    mocks.cacheOnboardingDraft.mockReset();
    mocks.refreshOnboarded.mockReset().mockResolvedValue(undefined);
    mocks.lastRoute = null;
    mocks.profile = {
      display_name: "Alex",
      term: "Fall 2026",
      work_schedule: "",
      learner_type: "college",
      schools: { name: "State University" },
    };
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
  it("collects only setup information the released product uses", () => {
    expect(ONBOARDING_STEPS).toEqual(["You", "School", "Term", "Classes", "Schedule"]);
  });

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

  it("requires students to choose their learner type instead of assuming college", () => {
    expect(isOnboardingIdentityValid({ name: "Alex", learnerType: "" })).toBe(false);
    expect(isOnboardingIdentityValid({ name: "Alex", learnerType: "middle_school" })).toBe(true);
    expect(isOnboardingIdentityValid({ name: "Alex", learnerType: "high_school" })).toBe(true);
    expect(isOnboardingIdentityValid({ name: "Alex", learnerType: "college" })).toBe(true);
  });

  it("keeps Next disabled when a new student enters only a name", async () => {
    mocks.profile = {
      display_name: "",
      term: "",
      work_schedule: "",
      learner_type: null,
      schools: null,
    };
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes><Route path="/onboarding" element={<Onboarding />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText("Alex"), { target: { value: "Jordan" } });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Middle school student" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("keeps partial setup in an account-scoped draft as answers change", async () => {
    mocks.profile = {
      display_name: "",
      term: "",
      work_schedule: "",
      learner_type: null,
      schools: null,
    };
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes><Route path="/onboarding" element={<Onboarding />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText("Alex"), { target: { value: "Jordan" } });

    await vi.waitFor(() => expect(mocks.cacheOnboardingDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Jordan" }),
      "user-1",
    ));
  });

  it("returns a first-time student to the protected deep link after setup", async () => {
    mocks.profile = {
      display_name: "Alex",
      term: "Fall 2026",
      work_schedule: "",
      learner_type: "college",
      schools: { name: "State University" },
    };
    mocks.lastRoute = "/classes/biology";
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/classes/biology" element={<p>Requested Biology class</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByPlaceholderText("Class name, e.g. Biology II"), {
      target: { value: "Biology" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));

    expect(await screen.findByText("Requested Biology class")).toBeInTheDocument();
    expect(mocks.saveOnboarding).toHaveBeenCalledTimes(1);
    expect(mocks.refreshOnboarded).toHaveBeenCalledTimes(1);
  });
});
