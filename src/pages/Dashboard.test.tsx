import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  mode: "demo" as "demo" | "real" | "loading",
  classes: [] as ClassInfo[],
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  realCoach: vi.fn(),
  realAgenda: vi.fn(),
  demoCoach: vi.fn(),
  demoAgenda: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: mocks.mode }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
    loading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

vi.mock("@/components/dashboard/TopStrip", () => ({
  TopStrip: () => <header>Greeting</header>,
}));

vi.mock("@/components/dashboard/RealCoachHero", () => ({
  RealCoachHero: () => {
    mocks.realCoach();
    return <section aria-label="Real coach"><h2>Today's focus</h2></section>;
  },
}));

vi.mock("@/components/real/RealTodaysPlan", () => ({
  RealTodaysPlan: () => {
    mocks.realAgenda();
    return <section aria-label="Real agenda"><h2>Up next</h2></section>;
  },
}));

vi.mock("@/components/dashboard/DemoCoachHero", () => ({
  DemoCoachHero: () => {
    mocks.demoCoach();
    return <section aria-label="Demo coach"><h2>Today's focus</h2></section>;
  },
}));

vi.mock("@/components/dashboard/DemoTodaysPlan", () => ({
  DemoTodaysPlan: () => {
    mocks.demoAgenda();
    return <section aria-label="Demo agenda"><h2>Up next</h2></section>;
  },
}));

describe("dashboard data modes", () => {
  beforeEach(() => {
    mocks.mode = "demo";
    mocks.classes = [];
    mocks.loading = false;
    mocks.error = null;
    mocks.reload.mockClear();
    mocks.realCoach.mockClear();
    mocks.realAgenda.mockClear();
    mocks.demoCoach.mockClear();
    mocks.demoAgenda.mockClear();
  });

  it("renders the production dashboard hierarchy with sample adapters in demo mode", () => {
    renderDashboard();

    expect(screen.getByRole("note", { name: "Demo information" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Class shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today's focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Up next" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your classes" })).toBeInTheDocument();
    expect(screen.getAllByText("Intro to Psychology").length).toBeGreaterThan(0);
    expect(mocks.demoCoach).toHaveBeenCalledOnce();
    expect(mocks.demoAgenda).toHaveBeenCalledOnce();
    expect(mocks.realCoach).not.toHaveBeenCalled();
    expect(mocks.realAgenda).not.toHaveBeenCalled();
  });

  it("never leaks sample classes into a signed-in dashboard", () => {
    mocks.mode = "real";
    mocks.classes = [classInfo("real-biology", "My Biology")];

    renderDashboard();

    expect(screen.queryByRole("note", { name: "Demo information" })).not.toBeInTheDocument();
    expect(screen.getAllByText("My Biology").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Intro to Psychology")).toHaveLength(0);
    expect(mocks.realCoach).toHaveBeenCalledOnce();
    expect(mocks.realAgenda).toHaveBeenCalledOnce();
    expect(mocks.demoCoach).not.toHaveBeenCalled();
    expect(mocks.demoAgenda).not.toHaveBeenCalled();
  });

  it("renders neither dataset while authentication is unresolved", () => {
    mocks.mode = "loading";
    mocks.loading = true;

    renderDashboard();

    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Class shortcuts" })).not.toBeInTheDocument();
    expect(mocks.realCoach).not.toHaveBeenCalled();
    expect(mocks.demoCoach).not.toHaveBeenCalled();
  });
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

function classInfo(id: string, name: string): ClassInfo {
  return {
    id,
    name,
    professor: "Professor",
    location: "Room 1",
    days: [],
    time: "",
    color: "bg-primary",
    currentTopic: "",
    nextExamDate: "",
    readiness: 0,
    suggestedAction: "",
    gradingWeights: [],
    chapters: [],
  };
}
