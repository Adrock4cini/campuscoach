import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealExamsView } from "./RealExamsView";

const mocks = vi.hoisted(() => ({
  deleteExam: vi.fn(),
  daysUntil: vi.fn(),
  exams: [] as Array<{
    id: string;
    client_class_id: string;
    title: string;
    exam_date: string | null;
    readiness: number;
    topics: string[];
    source?: "manual" | "canvas";
    source_url?: string | null;
  }>,
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "math", name: "College Algebra" }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealExams: () => ({
    items: mocks.exams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  daysUntil: (date: string | null) => mocks.daysUntil(date),
}));

vi.mock("@/lib/realData/exams", () => ({ deleteExam: mocks.deleteExam }));

vi.mock("@/components/real/AddExamDialog", () => ({
  AddExamDialog: () => null,
}));

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe("real exam actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.exams = [{
      id: "exam-1",
      client_class_id: "math",
      title: "Addition test",
      exam_date: "2099-09-01",
      readiness: 73,
      topics: ["Addition"],
    }];
    mocks.daysUntil.mockReset().mockReturnValue(5);
    mocks.deleteExam.mockReset().mockResolvedValue(true);
  });

  it("starts study with both the selected class and exam boundary", async () => {
    render(
      <MemoryRouter initialEntries={["/exams"]}>
        <RealExamsView />
        <Location />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Study for this exam/i }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/study-lab?classId=math&examId=exam-1",
      );
    });
  });

  it("requires confirmation before deleting and keeps a mobile-sized target", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemoryRouter><RealExamsView /></MemoryRouter>);

    const button = screen.getByRole("button", { name: "Delete Addition test" });
    expect(button).toHaveClass("h-11", "w-11");
    fireEvent.click(button);

    expect(confirm).toHaveBeenCalled();
    expect(mocks.deleteExam).not.toHaveBeenCalled();
  });

  it("keeps past exams as history without labelling them upcoming or offering study actions", () => {
    mocks.exams = [
      ...mocks.exams,
      {
        id: "exam-past",
        client_class_id: "math",
        title: "Old final",
        exam_date: "2026-06-01",
        readiness: 61,
        topics: ["Functions"],
      },
    ];
    mocks.daysUntil.mockImplementation((date: string | null) => date === "2026-06-01" ? -4 : 5);

    render(<MemoryRouter><RealExamsView /></MemoryRouter>);

    expect(screen.getByText("1 upcoming")).toBeInTheDocument();
    expect(screen.queryByText("2 upcoming")).not.toBeInTheDocument();

    const pastSection = screen.getByRole("heading", { name: "Past exams" }).closest("section");
    expect(pastSection).not.toBeNull();
    expect(within(pastSection!).getByText("Old final")).toBeInTheDocument();
    expect(within(pastSection!).getByText("Past · 4d ago")).toBeInTheDocument();
    expect(within(pastSection!).queryByText("Readiness")).not.toBeInTheDocument();
    expect(within(pastSection!).queryByRole("button", { name: /Study for this exam/i })).not.toBeInTheDocument();

    const upcomingSection = screen.getByRole("heading", { name: "Upcoming" }).closest("section");
    expect(upcomingSection).not.toBeNull();
    expect(within(upcomingSection!).getByRole("button", { name: /Study for this exam/i })).toBeInTheDocument();
  });
});
