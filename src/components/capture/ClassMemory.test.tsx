import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "@/lib/capture/types";
import { ClassMemory } from "./ClassMemory";

const mocks = vi.hoisted(() => ({
  mode: "real" as "real" | "demo" | "loading",
  userId: "student-a",
  listCaptures: vi.fn(),
  getCapturesForClass: vi.fn(),
  retryCaptureConcepts: vi.fn(),
  navigate: vi.fn(),
  invite: vi.fn(() => null),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: mocks.mode, user: mocks.mode === "real" ? { id: mocks.userId } : null }),
}));

vi.mock("@/lib/capture/processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/capture/processor")>();
  return { ...actual, listCaptures: mocks.listCaptures };
});

vi.mock("@/lib/supabase/capturePersistence", () => ({
  getCapturesForClass: mocks.getCapturesForClass,
  retryCaptureConcepts: mocks.retryCaptureConcepts,
}));

vi.mock("./CaptureDetailDrawer", () => ({
  CaptureDetailDrawer: () => null,
}));

vi.mock("./StudyFromCaptureDrawer", () => ({
  StudyFromCaptureDrawer: () => null,
}));

vi.mock("@/components/intelligence/ClassBrainAggregateStrip", () => ({
  ClassBrainAggregateStrip: () => null,
}));

vi.mock("@/components/invite/InviteClassmatesButton", () => ({
  InviteClassmatesButton: mocks.invite,
}));

const localSample: CaptureResult = {
  id: "local-sample",
  kind: "quick-note",
  context: {
    classId: "math",
    date: "2026-07-20",
    topic: "Atomic Composition",
    text: "Electrons, neutrons, and protons make up an atom.",
  },
  createdAt: "2026-07-20T10:00:00.000Z",
  keyConcepts: [],
  summary: "Sample science note",
  flashcardCount: 0,
};

const realCapture = {
  id: "remote-real",
  kind: "quick-note",
  clientClassId: "math",
  topic: "Quadratic Formula",
  processingStatus: "ready",
  flashcardsReady: false,
  createdAt: "2026-07-20T11:00:00.000Z",
  capturedOn: "2026-07-20",
  summary: "My real math note",
  keyConcepts: ["Discriminant"],
  rawText: "x equals negative b plus or minus...",
};


async function expandHistory() {
  const toggle = await screen.findByRole("button", { name: /(view|hide) class memory/i });
  if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
}

describe("Class Memory data boundaries", () => {
  beforeEach(() => {
    mocks.mode = "real";
    mocks.userId = "student-a";
    mocks.listCaptures.mockReset().mockReturnValue([localSample]);
    mocks.getCapturesForClass.mockReset().mockResolvedValue([realCapture]);
    mocks.retryCaptureConcepts.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
    mocks.invite.mockClear();
  });

  it("never mixes browser-local demo captures into a signed-in student's memory", async () => {
    render(<ClassMemory classId="math" className="Math" />);
    await expandHistory();

    expect(await screen.findByText("Quadratic Formula")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Atomic Composition")).not.toBeInTheDocument();
    });
  });

  it("keeps separate captures visible when their topic and date match", async () => {
    mocks.getCapturesForClass.mockResolvedValueOnce([
      { ...realCapture, id: "flashcards-part-1", kind: "scan-material", topic: "Flash cards" },
      { ...realCapture, id: "flashcards-part-2", kind: "scan-material", topic: "Flash cards" },
    ]);

    render(<ClassMemory classId="math" className="Math" />);
    await expandHistory();

    expect(await screen.findAllByText("Flash cards")).toHaveLength(2);
  });

  it("keeps the device-local capture store available in explicit demo mode", async () => {
    mocks.mode = "demo";

    render(<ClassMemory classId="math" className="Math" />);
    await expandHistory();

    expect(await screen.findByText("Atomic Composition")).toBeInTheDocument();
    expect(mocks.getCapturesForClass).not.toHaveBeenCalled();
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("does not expose a class invite until a real join route exists", async () => {
    render(<ClassMemory classId="math" className="Math" />);

    await expandHistory();
    await screen.findByText("Quadratic Formula");
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it("routes a signed-in capture into the concept-backed study lab", async () => {
    render(<ClassMemory classId="math" className="Math" />);

    await expandHistory();
    await screen.findByText("Quadratic Formula");
    fireEvent.click(screen.getByRole("button", { name: /^study/i }));

    expect(mocks.navigate).toHaveBeenCalledWith(
      "/study-lab?classId=math&captureId=remote-real&format=flashcards",
    );
  });

  it("never presents a failed real-data read as an empty Class Memory", async () => {
    mocks.getCapturesForClass.mockRejectedValueOnce(new Error("offline"));

    render(<ClassMemory classId="math" className="Math" />);

    expect(await screen.findByText("Couldn’t load Class Memory")).toBeInTheDocument();
    expect(screen.getByText(/saved captures were not deleted/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing captured yet/i)).not.toBeInTheDocument();
  });

  it("repairs a legacy false-ready capture and offers a safe retry instead of Study", async () => {
    mocks.getCapturesForClass.mockResolvedValueOnce([{
      ...realCapture,
      processingStatus: "ready",
      keyConcepts: [],
    }]);

    render(<ClassMemory classId="math" className="Math" />);
    await expandHistory();

    expect(await screen.findByText("needs attention")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^study/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(mocks.retryCaptureConcepts).toHaveBeenCalledWith(expect.objectContaining({
        id: "remote-real",
        clientClassId: "math",
        rawText: realCapture.rawText,
      }));
    });
  });

  it("ignores a stale response after the student switches classes", async () => {
    let resolveMath!: (rows: (typeof realCapture)[]) => void;
    let resolveScience!: (rows: (typeof realCapture)[]) => void;
    const mathRequest = new Promise<(typeof realCapture)[]>((resolve) => { resolveMath = resolve; });
    const scienceRequest = new Promise<(typeof realCapture)[]>((resolve) => { resolveScience = resolve; });
    mocks.getCapturesForClass.mockImplementation((classId: string) => (
      classId === "math" ? mathRequest : scienceRequest
    ));

    const { rerender } = render(<ClassMemory classId="math" className="Math" />);
    rerender(<ClassMemory classId="science" className="Science" />);

    await act(async () => {
      resolveScience([{ ...realCapture, id: "science-capture", topic: "Cell Division" }]);
    });
    await expandHistory();
    expect(await screen.findByText("Cell Division")).toBeInTheDocument();

    await act(async () => { resolveMath([realCapture]); });
    await waitFor(() => {
      expect(screen.queryByText("Quadratic Formula")).not.toBeInTheDocument();
    });
  });

  it("flips a processing capture to ready without the student reloading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.getCapturesForClass
        .mockResolvedValueOnce([{ ...realCapture, processingStatus: "processing", keyConcepts: [] }])
        .mockResolvedValue([realCapture]);

      render(<ClassMemory classId="math" className="Math" />);
      await act(async () => { await Promise.resolve(); });
      await expandHistory();

      expect(screen.queryByRole("button", { name: /^study/i })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^study/i })).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling and offers one manual check when processing stays slow", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.getCapturesForClass.mockResolvedValue([
        { ...realCapture, processingStatus: "processing", keyConcepts: [] },
      ]);

      render(<ClassMemory classId="math" className="Math" />);
      await act(async () => { await Promise.resolve(); });

      for (let i = 0; i < 8; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
      }

      expect(mocks.getCapturesForClass.mock.calls.length).toBeLessThanOrEqual(7);
      expect(await screen.findByRole("button", { name: "Check again" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides one student's captures immediately when the account changes", async () => {
    const { rerender } = render(<ClassMemory classId="math" className="Math" />);
    await expandHistory();
    expect(await screen.findByText("Quadratic Formula")).toBeInTheDocument();

    let resolveSecond!: (rows: (typeof realCapture)[]) => void;
    mocks.getCapturesForClass.mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    mocks.userId = "student-b";
    rerender(<ClassMemory classId="math" className="Math" />);

    expect(screen.queryByText("Quadratic Formula")).not.toBeInTheDocument();
    expect(screen.getByText("Loading Class Memory…")).toBeInTheDocument();

    await act(async () => {
      resolveSecond([{ ...realCapture, id: "student-b-capture", topic: "Linear Equations" }]);
    });
    await expandHistory();
    expect(await screen.findByText("Linear Equations")).toBeInTheDocument();
  });
});
