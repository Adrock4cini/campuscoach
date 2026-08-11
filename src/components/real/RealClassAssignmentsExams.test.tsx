import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealClassAssignmentsExams } from "./RealClassAssignmentsExams";

const mocks = vi.hoisted(() => ({
  openCapture: vi.fn(),
  getLatestAssignmentScan: vi.fn(),
  updateAssignment: vi.fn(),
  toastMessage: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const assignment = {
  id: "assignment-1",
  user_id: "user-1",
  client_class_id: "math",
  class_id: null,
  title: "Problem Set 1",
  due_date: "2099-09-01",
  estimated_minutes: 30,
  priority: "medium",
  status: "not_started",
  notes: null,
  created_at: "2026-08-07T10:00:00.000Z",
  updated_at: "2026-08-07T10:00:00.000Z",
};

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: mocks.openCapture }),
}));

vi.mock("@/lib/realData/hooks", () => ({
  useRealAssignments: () => ({
    items: [assignment],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useRealExams: () => ({
    items: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  daysUntil: () => 5,
}));

vi.mock("@/lib/realData/assignments", () => ({
  updateAssignment: mocks.updateAssignment,
}));

vi.mock("@/lib/supabase/capturePersistence", () => ({
  getLatestAssignmentScan: mocks.getLatestAssignmentScan,
}));

vi.mock("sonner", () => ({
  toast: {
    message: mocks.toastMessage,
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("./AddAssignmentDialog", () => ({ AddAssignmentDialog: () => null }));
vi.mock("./AddExamDialog", () => ({ AddExamDialog: () => null }));
vi.mock("./AssignmentHelpDialog", () => ({
  AssignmentHelpDialog: (props: {
    open: boolean;
    assignment: typeof assignment | null;
    onPhotograph: (value: typeof assignment) => void;
    onDontGetIt: (value: typeof assignment) => void;
    onPractice: (value: typeof assignment) => void;
  }) => props.open && props.assignment ? (
    <div>
      <button onClick={() => props.onPhotograph(props.assignment!)}>Photograph assignment</button>
      <button onClick={() => props.onDontGetIt(props.assignment!)}>I don't get it</button>
      <button onClick={() => props.onPractice(props.assignment!)}>Practice assignment</button>
    </div>
  ) : null,
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

function renderClassWork() {
  return render(
    <MemoryRouter initialEntries={["/classes/math"]}>
      <RealClassAssignmentsExams classId="math" />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function openHelp() {
  fireEvent.click(screen.getByRole("button", { name: "Help me" }));
}

describe("assignment help handoffs", () => {
  beforeEach(() => {
    mocks.openCapture.mockReset();
    mocks.getLatestAssignmentScan.mockReset();
    mocks.updateAssignment.mockReset();
    mocks.toastMessage.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("preselects the exact assignment when photographing it", () => {
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Photograph assignment" }));

    expect(mocks.openCapture).toHaveBeenCalledWith("scan-assignment", "math", {
      assignmentId: "assignment-1",
    });
  });

  it("records student confusion as an assignment note, never professor emphasis", () => {
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "I don't get it" }));

    expect(mocks.openCapture).toHaveBeenCalledWith("quick-note", "math", {
      assignmentId: "assignment-1",
    });
    expect(mocks.openCapture).not.toHaveBeenCalledWith(
      "professor-hint",
      expect.anything(),
      expect.anything(),
    );
  });

  it("opens Study Lab with the ready scan linked to the assignment", async () => {
    mocks.getLatestAssignmentScan.mockResolvedValue({
      id: "capture-1",
      processingStatus: "ready",
    });
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/study-lab?classId=math&captureId=capture-1",
      );
    });
    expect(mocks.getLatestAssignmentScan).toHaveBeenCalledWith("math", "assignment-1");
  });

  it("opens a preselected photograph flow when no assignment scan exists", async () => {
    mocks.getLatestAssignmentScan.mockResolvedValue(null);
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    await waitFor(() => {
      expect(mocks.openCapture).toHaveBeenCalledWith("scan-assignment", "math", {
        assignmentId: "assignment-1",
      });
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/classes/math");
  });

  it("waits without navigating or opening another capture while a scan is processing", async () => {
    mocks.getLatestAssignmentScan.mockResolvedValue({
      id: "capture-1",
      processingStatus: "processing",
    });
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    await waitFor(() => {
      expect(mocks.toastMessage).toHaveBeenCalledWith(
        "Your assignment is still being prepared",
        expect.anything(),
      );
    });
    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/classes/math");
  });

  it("shows an error without navigating or opening capture when the lookup fails", async () => {
    mocks.getLatestAssignmentScan.mockRejectedValue(new Error("offline"));
    renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Couldn’t open assignment practice. Try again.",
      );
    });
    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/classes/math");
  });

  it("does not continue a delayed practice handoff after unmount", async () => {
    let finishLookup: (value: { id: string; processingStatus: string }) => void = () => undefined;
    mocks.getLatestAssignmentScan.mockImplementation(() => new Promise((resolve) => {
      finishLookup = resolve;
    }));
    const view = renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    view.unmount();
    await act(async () => {
      finishLookup({ id: "capture-1", processingStatus: "ready" });
      await Promise.resolve();
    });

    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(mocks.toastMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not continue a delayed handoff after the active class changes", async () => {
    let finishLookup: (value: { id: string; processingStatus: string }) => void = () => undefined;
    mocks.getLatestAssignmentScan.mockImplementation(() => new Promise((resolve) => {
      finishLookup = resolve;
    }));
    const view = renderClassWork();
    openHelp();
    fireEvent.click(screen.getByRole("button", { name: "Practice assignment" }));

    view.rerender(
      <MemoryRouter initialEntries={["/classes/math"]}>
        <RealClassAssignmentsExams classId="biology" />
        <LocationProbe />
      </MemoryRouter>,
    );
    await act(async () => {
      finishLookup({ id: "capture-1", processingStatus: "ready" });
      await Promise.resolve();
    });

    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(mocks.toastMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/classes/math");
  });
});
