import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "@/lib/capture/types";
import { ClassMemory } from "./ClassMemory";

const mocks = vi.hoisted(() => ({
  mode: "real" as "real" | "demo" | "loading",
  listCaptures: vi.fn(),
  getCapturesForClass: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: mocks.mode }),
}));

vi.mock("@/lib/capture/processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/capture/processor")>();
  return { ...actual, listCaptures: mocks.listCaptures };
});

vi.mock("@/lib/supabase/capturePersistence", () => ({
  getCapturesForClass: mocks.getCapturesForClass,
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
  InviteClassmatesButton: () => null,
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
  summary: "My real math note",
  keyConcepts: [],
  rawText: "x equals negative b plus or minus...",
};

describe("Class Memory data boundaries", () => {
  beforeEach(() => {
    mocks.mode = "real";
    mocks.listCaptures.mockReset().mockReturnValue([localSample]);
    mocks.getCapturesForClass.mockReset().mockResolvedValue([realCapture]);
  });

  it("never mixes browser-local demo captures into a signed-in student's memory", async () => {
    render(<ClassMemory classId="math" className="Math" />);

    expect(await screen.findByText("Quadratic Formula")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Atomic Composition")).not.toBeInTheDocument();
    });
  });

  it("keeps the device-local capture store available in explicit demo mode", async () => {
    mocks.mode = "demo";

    render(<ClassMemory classId="math" className="Math" />);

    expect(await screen.findByText("Atomic Composition")).toBeInTheDocument();
    expect(mocks.getCapturesForClass).not.toHaveBeenCalled();
  });
});
