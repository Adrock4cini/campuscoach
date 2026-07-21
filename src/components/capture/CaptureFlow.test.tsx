import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassInfo } from "@/data/demo";
import * as captureProcessor from "@/lib/capture/processor";
import { CaptureFlow } from "./CaptureFlow";

const mocks = vi.hoisted(() => ({
  classes: [] as ClassInfo[],
  loading: true,
  error: null as string | null,
  reload: vi.fn(),
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
