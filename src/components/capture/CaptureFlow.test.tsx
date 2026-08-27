import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import * as captureProcessor from "@/lib/capture/processor";
import * as capturePersistence from "@/lib/supabase/capturePersistence";
import { readLastCaptureClassId, writeLastCaptureClassId } from "@/lib/capture/captureClassPreference";
import { writeCaptureDraft, type CaptureDraft } from "@/lib/capture/captureDraft";
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

function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

function seedOwnedDraft(draft: CaptureDraft) {
  writeCaptureDraft(draft, {
    owner: { mode: "real", userId: "user-1" },
  });
}

describe("CaptureFlow class boundaries", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.classes = [];
    mocks.loading = true;
    mocks.error = null;
    mocks.reload.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the class the capture was opened from, even when a draft names another class", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    writeLastCaptureClassId("math");
    seedOwnedDraft({ kind: "quick-note", classId: "math", date: "2026-08-24", topic: "", text: "Cell walls" });

    renderCapture("science");

    expect(screen.getByText(/Science/)).toBeTruthy();
    expect(screen.queryByText(/^Math$/)).toBeNull();
    expect(screen.getByPlaceholderText("Type here…")).toHaveValue("");
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

    // Ambiguous global capture asks exactly one question — the class — and no form.
    expect(screen.getByTestId("capture-class-question")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capture date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Topic \/ Chapter/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Type here…"), {
      target: { value: "Atoms have protons" },
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Science" }));
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
    // Locked roadmap doors are no longer advertised in the primary sheet.
    expect(screen.queryByRole("list", { name: "Coming next" })).not.toBeInTheDocument();
    expect(screen.queryByText("Record Lecture")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask Campus Brain/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scan Board/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Not tappable yet")).not.toBeInTheDocument();
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

    openDetails();
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

  it("restores assignment and exam links with the capture draft after a reload", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    seedOwnedDraft({
        kind: "scan-assignment",
        classId: "science",
        date: "2026-08-24",
        topic: "Cells",
        text: "",
        assignmentId: "assignment-science",
        examId: "exam-science",
        hadPhotos: true,
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

    openDetails();
    expect(screen.getByRole("combobox", { name: "Assignment" })).toHaveValue(
      "assignment-science",
    );
    expect(screen.getByRole("combobox", { name: "Preparing for" })).toHaveValue(
      "exam-science",
    );
    expect(screen.getByText(/Photos can't be saved by the phone/i)).toBeInTheDocument();
  });

  it("drops restored assignment and exam links when capture opens from another class", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    seedOwnedDraft({
        kind: "scan-assignment",
        classId: "math",
        date: "2026-08-24",
        topic: "Equations",
        text: "",
        assignmentId: "assignment-math",
        examId: "exam-math",
        hadPhotos: true,
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

    openDetails();
    expect(screen.getByRole("combobox", { name: "Class" })).toHaveValue("science");
    expect(screen.getByRole("combobox", { name: "Assignment" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Preparing for" })).toHaveValue("");
    expect(screen.getByLabelText("Topic / Chapter (optional)")).toHaveValue("");
    expect(screen.queryByText(/Photos can't be saved by the phone/i)).not.toBeInTheDocument();
  });

  it("opens a different assignment in the same class without restoring the old draft content", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    seedOwnedDraft({
      kind: "scan-assignment",
      classId: "science",
      date: "2026-08-24",
      topic: "Old private worksheet",
      text: "old assignment text",
      assignmentId: "assignment-other",
      hadPhotos: true,
    });

    render(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-assignment"
          initialClassId="science"
          initialAssignmentId="assignment-science"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    openDetails();
    expect(screen.getByRole("combobox", { name: "Assignment" })).toHaveValue("assignment-science");
    expect(screen.getByLabelText("Topic / Chapter (optional)")).toHaveValue("");
    expect(screen.queryByText(/Photos can't be saved by the phone/i)).not.toBeInTheDocument();
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

  it("keeps chosen photos when the sheet re-renders mid-capture", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    const view = renderMaterialCapture();

    fireEvent.change(screen.getByLabelText("Choose photos — notes or book"), {
      target: { files: [photo("card-1.jpg"), photo("card-2.jpg")] },
    });
    expect(screen.getByText("2 of 4 photos ready")).toBeInTheDocument();

    // Classes finishing loading (or any parent re-render) must not reset the draft.
    mocks.classes = [math, science, { id: "history", name: "History" } as ClassInfo];
    view.rerender(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-material"
          initialClassId="science"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 of 4 photos ready")).toBeInTheDocument();
  });

  it("closes instead of resetting when Back is pressed on a single-step capture", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CaptureFlow open initialKind="scan-material" initialClassId="science" onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Choose photos — notes or book"), {
      target: { files: [photo("card-1.jpg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("What do you want to add?")).not.toBeInTheDocument();
  });

  it("keeps the draft when the student steps back to the menu and returns", () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    render(
      <MemoryRouter>
        <CaptureFlow open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /scan notes or book/i }));
    fireEvent.change(screen.getByLabelText("Choose photos — notes or book"), {
      target: { files: [photo("card-1.jpg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("What do you want to add?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /scan notes or book/i }));
    expect(screen.getByText("1 of 4 photo ready")).toBeInTheDocument();
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

    openDetails();
    [
      screen.getByRole("combobox", { name: "Class" }),
      screen.getByLabelText(/Capture date/),
      screen.getByLabelText("Topic / Chapter (optional)"),
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
    openDetails();
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

  it("hands a saved assignment to practice with its durable capture id and assignment context", async () => {
    mocks.classes = [math, science];
    mocks.loading = false;
    const onClose = vi.fn();
    vi.spyOn(captureProcessor, "commitCapture").mockResolvedValueOnce({
      id: "local-attempt-id",
      captureId: "durable-capture-row-id",
      kind: "scan-assignment",
      context: {
        classId: "science",
        date: "2026-08-17",
        assignmentId: "assignment-science",
      },
      createdAt: "2026-08-17T12:00:00.000Z",
      keyConcepts: ["Cell structure"],
      summary: "Assignment saved",
      flashcardCount: 0,
      processingStatus: "ready",
      practiceSource: {
        status: "confirmed",
        text: "What is 14% of 50?",
        version: 2,
        hash: "a".repeat(64),
        confirmedAt: "2026-08-17T12:00:01.000Z",
      },
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <CaptureFlow
          open
          initialKind="scan-assignment"
          initialClassId="science"
          initialAssignmentId="assignment-science"
          onClose={onClose}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Choose photos — assignment"), {
      target: { files: [photo("homework.jpg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    expect(await screen.findByText("Saved to Science", {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Understand this problem" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/study-lab?classId=science&captureId=durable-capture-row-id&assignmentId=assignment-science&format=practice&intent=assignment-help",
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("local-attempt-id");
  });

  it("preserves the class supplied by a class-scoped capture action", () => {
    mocks.classes = [math, science];
    mocks.loading = false;

    renderCapture("science");

    // Class-scoped entry asks zero class questions.
    expect(screen.queryByTestId("capture-class-question")).not.toBeInTheDocument();
    expect(screen.getByTestId("capture-context-chip")).toHaveTextContent("Science · today");
    openDetails();
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

describe("CaptureFlow class memory and next action", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.classes = [math, science];
    mocks.loading = false;
    mocks.error = null;
    mocks.reload.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("reuses the class from the student's last capture so class-time capture stays one tap", () => {
    writeLastCaptureClassId("science");
    renderCapture();
    expect(screen.queryByTestId("capture-class-question")).not.toBeInTheDocument();
    expect(screen.getByTestId("capture-context-chip")).toHaveTextContent("Science · today");
  });

  it("ignores a remembered class the student no longer has", () => {
    writeLastCaptureClassId("dropped-class");
    renderCapture();
    expect(screen.getByTestId("capture-class-question")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-context-chip")).not.toBeInTheDocument();
  });

  it("defaults the capture date to today and keeps topic optional", async () => {
    const commit = vi.spyOn(captureProcessor, "commitCapture").mockResolvedValueOnce({
      id: "capture-1",
      kind: "quick-note",
      context: { classId: "science", date: "2026-07-20", text: "Atoms" },
      createdAt: "2026-07-20T10:00:00.000Z",
      keyConcepts: [],
      summary: "Note captured",
      flashcardCount: 0,
    });
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    renderCapture("science");
    openDetails();
    expect(screen.getByLabelText(/Capture date/)).toHaveValue(todayKey);
    // Topic is never required before capture.
    expect(screen.getByLabelText(/Topic \/ Chapter/)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.change(screen.getByPlaceholderText("Type here…"), { target: { value: "Atoms" } });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText(/Saved to Class Memory|Added to Campus Brain/, {}, { timeout: 3000 });
    expect(commit).toHaveBeenCalledTimes(1);
    const context = commit.mock.calls[0][1] as { date: string; topic?: string };
    expect(context.date).toBe(todayKey);
    expect(context.topic ?? "").toBe("");
  });

  it("requires a real assignment target before saving a global homework capture", () => {
    render(
      <MemoryRouter>
        <CaptureFlow open initialKind="scan-assignment" initialClassId="science" onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("capture-context-chip")).toHaveTextContent("Science · today");
    // The photo worker does not create assignment logistics. The student must
    // select an existing assignment or name a new one before the durable save.
    expect(screen.queryByLabelText("Assignment name")).not.toBeInTheDocument();

    const library = screen.getByLabelText(/^Choose photos/) as HTMLInputElement;
    fireEvent.change(library, { target: { files: [photo("page-1.jpg"), photo("page-2.jpg")] } });
    fireEvent.change(library, { target: { files: [photo("page-3.jpg")] } });

    // One context covers every page — the form never reappears per photo.
    expect(screen.getAllByTestId("capture-context-chip")).toHaveLength(1);
    expect(screen.queryByTestId("capture-class-question")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save assignment/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Choose an assignment or add its name" }));
    fireEvent.change(screen.getByLabelText("Assignment name"), {
      target: { value: "Chapter 4 homework" },
    });
    expect(screen.getByRole("button", { name: /save assignment/i })).toBeEnabled();
  });

  it("surfaces assignment review immediately when an in-place retry finishes", async () => {
    vi.spyOn(captureProcessor, "commitCapture").mockResolvedValueOnce({
      id: "local-attempt-id",
      captureId: "durable-capture-row-id",
      materialIds: ["material-1"],
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
      processingStatus: "failed",
      processingMessage: "The photo is saved, but reading failed.",
    });
    const retry = vi.spyOn(capturePersistence, "retryCaptureImagesWithResult").mockResolvedValueOnce({
      processingStatus: "ready",
      practiceSource: {
        status: "needs_review",
        text: "What is 14% of 50?",
        version: 1,
        hash: null,
        confirmedAt: null,
      },
    });

    render(
      <MemoryRouter>
        <CaptureFlow
          open
          initialKind="scan-assignment"
          initialClassId="science"
          initialAssignmentId="assignment-science"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Choose photos — assignment"), {
      target: { files: [photo("homework.jpg")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));

    expect(await screen.findByRole("button", { name: "Retry processing" }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));

    expect(await screen.findByText("Check the problem")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Problem Campus Companion read" })).toHaveValue(
      "What is 14% of 50?",
    );
    expect(retry).toHaveBeenCalledWith("durable-capture-row-id", ["material-1"]);
  });

  it("remembers a switched class only after the capture actually saves", async () => {
    vi.spyOn(captureProcessor, "commitCapture").mockRejectedValueOnce(new Error("offline"));

    renderCapture("science");
    openDetails();
    fireEvent.change(screen.getByRole("combobox", { name: "Class" }), { target: { value: "math" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.change(screen.getByPlaceholderText("Type here…"), { target: { value: "Slope" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Capture wasn't saved", {}, { timeout: 3000 });
    expect(readLastCaptureClassId({ allowedClassIds: ["math", "science"] })).toBeNull();
  });

  it("offers one compact practice action after a real capture", () => {
    const onPractice = vi.fn();
    render(
      <MemoryRouter>
        <CaptureDoneSummary
          sample={false}
          result={{
            id: "capture-1",
            kind: "record-lecture",
            context: { classId: "science", date: "2026-08-13", topic: "Cells" },
            createdAt: "2026-08-13T12:00:00.000Z",
            keyConcepts: [],
            summary: "Saved lecture",
            flashcardCount: 0,
          }}
          className="Science"
          onClose={vi.fn()}
          onOpenClass={vi.fn()}
          onPractice={onPractice}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /practice this now/i }));
    expect(onPractice).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /save for later/i })).toBeInTheDocument();
  });

  it("requires assignment OCR review before offering the tutor action", () => {
    render(
      <MemoryRouter>
        <CaptureDoneSummary
          sample={false}
          result={{
            id: "capture-1",
            captureId: "capture-row-1",
            kind: "scan-assignment",
            context: {
              classId: "science",
              date: "2026-08-13",
              assignmentId: "assignment-science",
            },
            createdAt: "2026-08-13T12:00:00.000Z",
            keyConcepts: ["Percent of a number"],
            summary: "Assignment saved",
            flashcardCount: 0,
            processingStatus: "ready",
            practiceSource: {
              status: "needs_review",
              text: "What is 14% of 50?",
              version: 1,
              hash: null,
              confirmedAt: null,
            },
          }}
          className="Science"
          onClose={vi.fn()}
          onOpenClass={vi.fn()}
          onPractice={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Check the problem")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Problem Campus Companion read" })).toHaveValue(
      "What is 14% of 50?",
    );
    expect(screen.queryByRole("button", { name: "Understand this problem" })).not.toBeInTheDocument();
  });
});

describe("Quick Capture tile dispatch", () => {
  beforeEach(() => {
    mocks.classes = [math, science];
    mocks.loading = false;
    mocks.error = null;
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases: Array<[string, string]> = [
    ["Quick Note", "Quick Note"],
    ["Scan Assignment", "Scan Assignment"],
    ["Scan Notes or Book", "Scan Notes or Book"],
    ["Teacher Hint", "Teacher Hint"],
  ];

  it.each(cases)("opens the %s composer from its own tile", (tile, heading) => {
    render(
      <MemoryRouter>
        <CaptureFlow open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tile}`) }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(heading);
  });

  it("keeps the typed-note composer for Quick Note, not the photo composer", () => {
    render(
      <MemoryRouter>
        <CaptureFlow open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Quick Note/ }));
    expect(screen.getByPlaceholderText("Type here…")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Take photo — assignment/i)).not.toBeInTheDocument();
  });
});
