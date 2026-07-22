import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotesPage from "./NotesPage";

const mocks = vi.hoisted(() => ({
  getRecentCaptures: vi.fn(),
  openCapture: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/contexts/CaptureContext", () => ({
  useCapture: () => ({ open: mocks.openCapture }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{ id: "math", name: "College Algebra", color: "bg-primary" }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/capturePersistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/capturePersistence")>();
  return { ...actual, getRecentCaptures: mocks.getRecentCaptures };
});

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe("real notes and recordings", () => {
  beforeEach(() => {
    mocks.openCapture.mockReset();
    mocks.getRecentCaptures.mockReset().mockResolvedValue([
      {
        id: "capture-1",
        kind: "quick-note",
        clientClassId: "math",
        topic: "Quadratic Formula",
        processingStatus: "ready",
        flashcardsReady: true,
        createdAt: "2026-07-20T10:00:00.000Z",
        summary: "Use the discriminant to predict the number of solutions.",
        keyConcepts: ["Discriminant"],
        rawText: "b squared minus four ac",
      },
    ]);
  });

  it("loads the signed-in student's real capture and opens an exact study target", async () => {
    render(
      <MemoryRouter initialEntries={["/notes"]}>
        <NotesPage />
        <Location />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Quadratic Formula")).toBeInTheDocument();
    expect(screen.getAllByText(/College Algebra/)).toHaveLength(2);
    expect(screen.getByText(/Use the discriminant/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Study this/i }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/study-lab?classId=math&captureId=capture-1",
      );
    });
  });

  it("opens the real typed capture flow instead of a placeholder notes route", async () => {
    render(
      <MemoryRouter>
        <NotesPage />
      </MemoryRouter>,
    );

    await screen.findByText("Quadratic Formula");
    fireEvent.click(screen.getByRole("button", { name: /Quick note/i }));
    expect(mocks.openCapture).toHaveBeenCalledWith("quick-note");

    fireEvent.click(screen.getByRole("button", { name: /Professor hint/i }));
    expect(mocks.openCapture).toHaveBeenCalledWith("professor-hint");
  });

  it("shows a retry state instead of pretending a failed read means no notes", async () => {
    mocks.getRecentCaptures.mockRejectedValueOnce(new Error("network"));

    render(
      <MemoryRouter>
        <NotesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Couldn’t load your notes")).toBeInTheDocument();
    expect(screen.getByText(/saved work was not deleted/i)).toBeInTheDocument();
    expect(screen.queryByText("No captures here yet")).not.toBeInTheDocument();
  });
});
