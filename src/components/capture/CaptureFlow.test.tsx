import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import * as captureProcessor from "@/lib/capture/processor";
import { CaptureDoneSummary, CaptureFlow } from "./CaptureFlow";

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
      exam_date: "2099-07-30",
    },
    {
      id: "exam-science",
      client_class_id: "science",
      title: "Science test",
      exam_date: "2099-08-01",
    },
    {
      id: "exam-science-past",
      client_class_id: "science",
      title: "Old science test",
      exam_date: "2000-08-01",
    },
    {
      id: "exam-science-tbd",
      client_class_id: "science",
      title: "Science test date TBD",
      exam_date: null,
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

function photo(name: string) {
  return new File([new Uint8Array(100)], name, { type: "image/jpeg" });
}

function renderMaterialCapture() {
  return render(
    <MemoryRouter>
      <CaptureFlow
        open
        initialKind="scan-material"
        initialClassId="science"
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
}

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("labels a device-only demo capture without implying an account update", () => {
    render(
      <MemoryRouter>
        <CaptureDoneSummary
          sample
          result={{
            id: "demo-capture",
            kind: "record-lecture",
            context: { classId: "psych101", date: "2026-08-13", topic: "Memory models" },
            createdAt: "2026-08-13T12:00:00.000Z",
            keyConcepts: ["Working memory"],
            summary: "Sample lecture summary",
            flashcardCount: 6,
          }}
          className="Intro to Psychology"
          onClose={vi.fn()}
          onOpenClass={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Saved in this demo for Intro to Psychology")).toBeInTheDocument();
    expect(screen.getByText(/stored on this device for the demo only/i)).toBeInTheDocument();
    expect(screen.getByText(/sample flashcards created for this demo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Campus Brain updated/i)).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Teacher Hint/i })).toBeEnabled();
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
    expect(screen.getByRole("option", { name: /^Science test · 2099/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Math test/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Old science test/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Science test date TBD/i })).toBeInTheDocument();

    fireEvent.change(assignmentPicker, { target: { value: "assignment-science" } });
    fireEvent.change(examPicker, { target: { value: "exam-science" } });
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Choose photos — assignment"), {
      target: {
        files: [new File([new Uint8Array(100)], "homework.jpg", { type: "image/jpeg" })],
      },
    });
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeEnabled();
  });

  it("keeps an in-flight private photo upload open across close gestures", () => {
    vi.useFakeTimers();
    mocks.classes = [math, science];
    mocks.loading = false;
    const onClose = vi.fn();
    vi.spyOn(captureProcessor, "commitCapture").mockReturnValueOnce(new Promise(() => undefined));

    const view = render(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-material"
          initialClassId="science"
          onClose={onClose}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Choose photos — notes or book"), {
      target: { files: [photo("private-page.jpg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to class" }));

    expect(screen.getByRole("heading", { name: "Campus Brain is working…" })).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent.click(view.container.querySelector(".capture-backdrop") as HTMLElement);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Campus Brain is working…" })).toBeInTheDocument();
  });

  it("keeps an oversized selection usable and lets the student remove individual photos", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    renderMaterialCapture();

    const libraryInput = screen.getByLabelText("Choose photos — notes or book");
    fireEvent.change(libraryInput, {
      target: {
        files: Array.from({ length: 6 }, (_, index) => photo(`flash-card-${index + 1}.jpg`)),
      },
    });

    expect(libraryInput).toHaveValue("");
    const removeButtons = screen.getAllByRole("button", { name: /Remove photo \d/i });
    const cameraInput = screen.getByLabelText("Take photo — notes or book");
    expect(removeButtons).toHaveLength(4);
    expect(removeButtons[0]).toHaveClass("h-11", "w-11");
    expect(cameraInput.closest("label")).toHaveClass("min-h-11");
    expect(libraryInput.closest("label")).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Remove all photos" })).toHaveClass("min-h-11");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("4 of 4 photos ready")).toBeInTheDocument();
    expect(screen.getByText(/Only 4 photos can be added at once/i)).toHaveTextContent(
      "Only 4 photos can be added at once. 2 photos weren't added. Save these 4, then start another capture.",
    );
    expect(cameraInput).toBeDisabled();
    expect(libraryInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to class" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));

    expect(screen.getAllByRole("button", { name: /Remove photo \d/i })).toHaveLength(3);
    expect(screen.getByText("3 of 4 photos ready")).toBeInTheDocument();
    expect(screen.queryByText(/Only 4 photos can be added at once/i)).not.toBeInTheDocument();
    expect(cameraInput).toBeEnabled();
    expect(libraryInput).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove all photos" }));

    expect(screen.queryByRole("button", { name: /Remove photo \d/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to class" })).toBeDisabled();
  });

  it("appends camera and library photos through the same four-photo limit", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    renderMaterialCapture();

    const libraryInput = screen.getByLabelText("Choose photos — notes or book");
    const cameraInput = screen.getByLabelText("Take photo — notes or book");

    fireEvent.change(libraryInput, {
      target: { files: [photo("card-1.jpg"), photo("card-2.jpg")] },
    });
    fireEvent.change(cameraInput, {
      target: { files: [photo("card-3.jpg")] },
    });

    expect(libraryInput).toHaveValue("");
    expect(cameraInput).toHaveValue("");
    expect(screen.getByText("3 of 4 photos ready")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Remove photo \d/i })).toHaveLength(3);
  });

  it("recovers after the student removes an unsupported photo", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    renderMaterialCapture();

    const libraryInput = screen.getByLabelText("Choose photos — notes or book");
    const cameraInput = screen.getByLabelText("Take photo — notes or book");
    fireEvent.change(libraryInput, {
      target: { files: [new File([new Uint8Array(100)], "card.gif", { type: "image/gif" })] },
    });

    expect(screen.getByText(/Use a JPG, PNG, WebP, HEIC, or HEIF image/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to class" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    fireEvent.change(cameraInput, { target: { files: [photo("replacement.jpg")] } });

    expect(cameraInput).toHaveValue("");
    expect(screen.getByText("1 of 4 photo ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to class" })).toBeEnabled();
  });

  it("releases photo preview URLs when a photo is removed or the capture closes", () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectUrl = vi.fn((file: Blob) => `blob:${(file as File).name}`);
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      mocks.classes = [math, science];
      mocks.loading = false;
      const view = renderMaterialCapture();

      fireEvent.change(screen.getByLabelText("Choose photos — notes or book"), {
        target: { files: [photo("card-1.jpg"), photo("card-2.jpg")] },
      });
      expect(createObjectUrl).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:card-2.jpg");

      view.unmount();
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:card-1.jpg");
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, "createObjectURL", {
          configurable: true,
          value: originalCreateObjectUrl,
        });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevokeObjectUrl) {
        Object.defineProperty(URL, "revokeObjectURL", {
          configurable: true,
          value: originalRevokeObjectUrl,
        });
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });

  it("keeps the mobile assignment sheet inside the viewport without iOS form zoom", () => {
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

    expect(screen.getByTestId("capture-sheet")).toHaveClass(
      "max-w-[100dvw]",
      "min-w-0",
      "overflow-x-hidden",
    );

    [
      screen.getByRole("combobox", { name: "Class" }),
      screen.getByLabelText("Capture date"),
      screen.getByLabelText("Topic / Chapter"),
      screen.getByRole("combobox", { name: "Assignment" }),
      screen.getByLabelText("Assignment name"),
      screen.getByLabelText(/Due date/),
      screen.getByRole("combobox", { name: "Preparing for" }),
    ].forEach((control) => {
      expect(control).toHaveClass("text-base", "sm:text-sm");
    });
  });

  it("asks a returning student to choose the class that owns the syllabus", () => {
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
    expect(screen.getByTestId("location")).toHaveTextContent("/classes?intent=syllabus");
  });

  it("keeps assignment photos, links, and one attempt id across a dropped-response retry", async () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    const commit = vi.spyOn(captureProcessor, "commitCapture")
      .mockRejectedValueOnce(new Error("We couldn't upload these photos."))
      .mockResolvedValueOnce({
        id: "capture-1",
        kind: "scan-assignment",
        context: {
          classId: "science",
          date: "2026-08-17",
          assignmentId: "assignment-science",
        },
        createdAt: "2026-08-17T12:00:00.000Z",
        keyConcepts: [],
        summary: "Assignment saved",
        flashcardCount: 0,
      });

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
    fireEvent.change(screen.getByLabelText("Choose photos — assignment"), {
      target: {
        files: [new File([new Uint8Array(100)], "homework.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));

    expect(await screen.findByText("Capture wasn't saved", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Your photos and choices are still here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Saved to Science", {}, { timeout: 3000 })).toBeInTheDocument();

    expect(commit).toHaveBeenCalledTimes(2);
    const firstOptions = commit.mock.calls[0][2];
    const retryOptions = commit.mock.calls[1][2];
    expect(firstOptions?.attemptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryOptions?.attemptId).toBe(firstOptions?.attemptId);
    expect(retryOptions?.ownerId).toBe("user-1");
    expect(retryOptions?.attachments).toHaveLength(1);
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
