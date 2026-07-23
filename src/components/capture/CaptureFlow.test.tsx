import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import * as captureProcessor from "@/lib/capture/processor";
import { CaptureFlow } from "./CaptureFlow";

const mocks = vi.hoisted(() => ({
  classes: [] as ClassInfo[],
  loading: true,
  error: null as string | null,
  reload: vi.fn(),
  assignments: [
    {
      id: "assignment-math",
      client_class_id: "math",
      title: "Math homework",
      due_date: "2026-07-25",
    },
    {
      id: "assignment-science",
      client_class_id: "science",
      title: "Science lab",
      due_date: "2026-07-26",
    },
  ],
  exams: [
    {
      id: "exam-math",
      client_class_id: "math",
      title: "Math test",
      exam_date: "2026-07-30",
    },
    {
      id: "exam-science",
      client_class_id: "science",
      title: "Science test",
      exam_date: "2026-08-01",
    },
  ],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isDemoMode: false,
  }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: mocks.classes,
    isReal: true,
    loading: mocks.loading,
    error: mocks.error,
    reload: mocks.reload,
  }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: mocks.assignments,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRealExams: () => ({
    items: mocks.exams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const math = {
  id: "math",
  name: "Math",
} as ClassInfo;

const science = {
  id: "science",
  name: "Science",
} as ClassInfo;

function renderCapture(initialClassId?: string) {
  return render(
    <MemoryRouter>
      <CaptureFlow
        open
        initialKind="quick-note"
        initialClassId={initialClassId}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

describe("CaptureFlow class boundaries", () => {
  beforeEach(() => {
    mocks.classes = [];
    mocks.loading = true;
    mocks.error = null;
    mocks.reload.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not silently choose the first class after global capture loads", () => {
    const view = renderCapture();
    expect(screen.getByText("Loading your classes…")).toBeInTheDocument();

    mocks.classes = [math, science];
    mocks.loading = false;
    view.rerender(
      <MemoryRouter>
        <CaptureFlow open initialKind="quick-note" onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const classPicker = screen.getByRole("combobox", { name: "Class" });
    expect(classPicker).toHaveValue("");
    expect(screen.getByRole("option", { name: "Choose a class" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Type here…"), {
      target: { value: "Atoms have protons" },
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    fireEvent.change(classPicker, { target: { value: "science" } });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("only presents working real capture modes as buttons", () => {
    mocks.classes = [math, science];
    mocks.loading = false;

    render(
      <MemoryRouter>
        <CaptureFlow open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Quick Note/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Professor Hint/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Scan Assignment/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Scan Notes or Book/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Scan Syllabus/i })).toBeEnabled();
    expect(screen.getByRole("list", { name: "Coming next" })).toBeInTheDocument();
    expect(screen.getByText("Record Lecture")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record Lecture/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scan Board/i })).not.toBeInTheDocument();
    expect(screen.getByText("Not tappable yet")).toBeInTheDocument();
  });

  it("requires a photo and only shows assignment and exam targets from the chosen class", () => {
    mocks.classes = [math, science];
    mocks.loading = false;

    render(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-assignment"
          initialClassId="science"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    const assignmentPicker = screen.getByRole("combobox", { name: "Assignment" });
    const examPicker = screen.getByRole("combobox", { name: "Preparing for" });
    expect(screen.getByRole("option", { name: /Science lab/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Math homework/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Science test/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Math test/i })).not.toBeInTheDocument();

    fireEvent.change(assignmentPicker, { target: { value: "assignment-science" } });
    fireEvent.change(examPicker, { target: { value: "exam-science" } });
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Assignment photos"), {
      target: {
        files: [new File([new Uint8Array(100)], "homework.jpg", { type: "image/jpeg" })],
      },
    });
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeEnabled();
  });

  it("opens the existing confirm-before-save syllabus importer", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    const onClose = vi.fn();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <CaptureFlow open onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Scan Syllabus/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location")).toHaveTextContent("/onboarding?import=syllabus");
  });

  it("keeps assignment photos and links available when the upload is not confirmed", async () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    vi.spyOn(captureProcessor, "commitCapture").mockRejectedValueOnce(
      new Error("We couldn't upload these photos."),
    );

    render(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-assignment"
          initialClassId="science"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Assignment" }), {
      target: { value: "assignment-science" },
    });
    fireEvent.change(screen.getByLabelText("Assignment photos"), {
      target: {
        files: [new File([new Uint8Array(100)], "homework.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));

    expect(await screen.findByText("Capture wasn't saved", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Your photos and choices are still here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review capture" }));
    expect(screen.getByText("1 photo ready")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Assignment" })).toHaveValue("assignment-science");
  });

  it("preserves the class supplied by a class-scoped capture action", () => {
    mocks.classes = [math, science];
    mocks.loading = false;

    renderCapture("science");

    expect(screen.getByRole("combobox", { name: "Class" })).toHaveValue("science");
  });

  it("does not mistake a class load failure for a student with no classes", () => {
    mocks.loading = false;
    mocks.error = "Couldn’t load your classes";

    renderCapture();

    expect(screen.getByText("Couldn’t load your classes")).toBeInTheDocument();
    expect(screen.getByText(/saved classes were not deleted/i)).toBeInTheDocument();
    expect(screen.queryByText(/add a class before saving/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.reload).toHaveBeenCalledOnce();
  });

  it("keeps the student's note available when Supabase does not confirm the save", async () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    vi.spyOn(captureProcessor, "commitCapture").mockRejectedValueOnce(
      new Error("We couldn't save this capture. Check your connection and try again."),
    );

    renderCapture("science");
    const note = screen.getByPlaceholderText("Type here…");
    fireEvent.change(note, { target: { value: "Atoms have three subatomic particles" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Capture wasn't saved", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Your note is still here.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review note" }));
    expect(screen.getByPlaceholderText("Type here…")).toHaveValue(
      "Atoms have three subatomic particles",
    );
  });

  it("does not claim Campus Brain finished when only the source was saved", async () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    vi.spyOn(captureProcessor, "commitCapture").mockResolvedValueOnce({
      id: "capture-1",
      kind: "quick-note",
      context: {
        classId: "science",
        date: "2026-07-20",
        text: "Atoms have three subatomic particles",
      },
      createdAt: "2026-07-20T10:00:00.000Z",
      keyConcepts: [],
      summary: "Note captured",
      flashcardCount: 0,
      processingStatus: "failed",
      processingMessage: "Your note is safe, but Campus Brain couldn't finish processing it.",
    });

    renderCapture("science");
    fireEvent.change(screen.getByPlaceholderText("Type here…"), {
      target: { value: "Atoms have three subatomic particles" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Saved to Class Memory", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/note is safe/i)).toBeInTheDocument();
    expect(screen.queryByText("Added to Campus Brain")).not.toBeInTheDocument();
  });
});
