import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealAssignmentDetail } from "./RealAssignmentDetail";

const mocks = vi.hoisted(() => ({
  getAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  openCapture: vi.fn(),
  getLatestCaptureForAssignment: vi.fn(),
  retryCaptureProcessing: vi.fn(),
}));

vi.mock("@/contexts/CaptureContext", () => ({ useCapture: () => ({ open: mocks.openCapture }) }));
vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({ classes: [{ id: "bio", name: "Biology 101" }], loading: false, error: null, reload: vi.fn() }),
}));
vi.mock("@/lib/realData/hooks", () => ({ daysUntil: () => 2 }));
vi.mock("@/lib/realData/assignments", () => ({
  getAssignment: mocks.getAssignment,
  updateAssignment: mocks.updateAssignment,
  deleteAssignment: mocks.deleteAssignment,
}));
vi.mock("@/lib/supabase/capturePersistence", () => ({
  getLatestCaptureForAssignment: mocks.getLatestCaptureForAssignment,
  retryCaptureProcessing: mocks.retryCaptureProcessing,
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/assignments/a-1"]}>
      <Routes>
        <Route path="/assignments/:assignmentId" element={<RealAssignmentDetail />} />
        <Route path="/study-lab" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function assignmentCapture(processingStatus: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "capture-1",
    kind: "scan-assignment",
    assignmentId: "a-1",
    clientClassId: "bio",
    topic: "Percent problems",
    processingStatus,
    flashcardsReady: false,
    createdAt: "2026-01-02T00:00:00Z",
    capturedOn: "2026-01-02",
    summary: null,
    keyConcepts: [],
    rawText: "What is 14% of 50?",
    practiceSource: {
      status: "confirmed",
      text: "What is 14% of 50?",
      version: 2,
      hash: "a".repeat(64),
      confirmedAt: "2026-01-02T00:00:01Z",
    },
    materials: [],
    ...overrides,
  };
}

describe("RealAssignmentDetail", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getLatestCaptureForAssignment.mockResolvedValue(null);
    mocks.retryCaptureProcessing.mockResolvedValue("ready");
    mocks.getAssignment.mockResolvedValue({
      id: "a-1",
      user_id: "student",
      client_class_id: "bio",
      class_id: null,
      title: "Chapter 4 problem set",
      due_date: "2099-01-05",
      estimated_minutes: 45,
      priority: "high",
      status: "not_started",
      notes: "Show your work",
      source: "manual",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
  });

  it("shows the student's real assignment, not a demo one", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Chapter 4 problem set" })).toBeInTheDocument();
    expect(mocks.getLatestCaptureForAssignment).toHaveBeenCalledWith("a-1");
    expect(screen.getByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByText("Show your work")).toBeInTheDocument();
  });

  it("starts a new exact assignment capture when no saved help exists", async () => {
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Get help with this" }));

    expect(mocks.openCapture).toHaveBeenCalledWith("scan-assignment", {
      classId: "bio",
      assignmentId: "a-1",
    });
  });

  it("continues a ready capture in Assignment Tutor with all target ids", async () => {
    mocks.getLatestCaptureForAssignment.mockResolvedValue(assignmentCapture("ready"));
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Continue help" }));

    const location = screen.getByTestId("location").textContent ?? "";
    const [pathname, query = ""] = location.split("?");
    expect(pathname).toBe("/study-lab");
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      classId: "bio",
      captureId: "capture-1",
      assignmentId: "a-1",
      format: "practice",
      intent: "assignment-help",
    });
  });

  it("shows processing truthfully and turns ready after a successful retry", async () => {
    mocks.getLatestCaptureForAssignment
      .mockResolvedValueOnce(assignmentCapture("processing"))
      .mockResolvedValueOnce(assignmentCapture("ready"));
    renderDetail();

    expect(await screen.findByText("Campus Companion is still reading this assignment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get help with this" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));

    await waitFor(() => expect(mocks.retryCaptureProcessing).toHaveBeenCalledWith("capture-1"));
    expect(await screen.findByRole("button", { name: "Continue help" })).toBeInTheDocument();
  });

  it("requires the photographed problem to be reviewed before continuing", async () => {
    mocks.getLatestCaptureForAssignment.mockResolvedValue(assignmentCapture("ready", {
      practiceSource: {
        status: "needs_review",
        text: "What is 14% of 50?",
        version: 1,
        hash: null,
        confirmedAt: null,
      },
    }));
    renderDetail();

    expect(await screen.findByText("Check the problem")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Problem Campus Companion read" })).toHaveValue(
      "What is 14% of 50?",
    );
    expect(screen.queryByRole("button", { name: "Continue help" })).not.toBeInTheDocument();
  });

  it("offers both retry and a fresh capture when reading failed", async () => {
    mocks.getLatestCaptureForAssignment.mockResolvedValue(assignmentCapture("failed"));
    renderDetail();

    expect(await screen.findByText("Campus Companion saved this assignment, but couldn’t finish reading it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try processing again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Capture again" }));
    expect(mocks.openCapture).toHaveBeenCalledWith("scan-assignment", {
      classId: "bio",
      assignmentId: "a-1",
    });
  });

  it("fails closed instead of continuing a capture from another class", async () => {
    mocks.getLatestCaptureForAssignment.mockResolvedValue(assignmentCapture("ready", {
      clientClassId: "chem",
    }));
    renderDetail();

    expect(await screen.findByText("This saved help session doesn’t match this assignment’s class.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue help" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture again" })).toBeInTheDocument();
  });

  it("offers a recoverable retry instead of a dead end when loading fails", async () => {
    mocks.getAssignment.mockRejectedValue(new Error("offline"));
    renderDetail();
    expect(await screen.findByText("Couldn’t load this assignment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not mistake a capture lookup failure for no saved help", async () => {
    mocks.getLatestCaptureForAssignment.mockRejectedValue(new Error("offline"));
    renderDetail();

    expect(await screen.findByText("Couldn’t load this assignment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get help with this" })).not.toBeInTheDocument();
  });

  it("says plainly when the assignment was deleted elsewhere", async () => {
    mocks.getAssignment.mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText("This assignment no longer exists")).toBeInTheDocument();
  });
});
