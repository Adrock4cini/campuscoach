import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanvasConnectionPage from "./CanvasConnectionPage";
import { beginCanvasConnection, getCanvasStatus, syncCanvas } from "@/lib/canvas/integration";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("@/lib/canvas/integration", () => ({
  beginCanvasConnection: vi.fn(),
  disconnectCanvas: vi.fn(),
  getCanvasStatus: vi.fn(),
  notifyCanvasDataChanged: vi.fn(),
  syncCanvas: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Canvas connection", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses the school's secure Canvas sign-in without asking for a password", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({ connected: false, status: "disconnected" });
    vi.mocked(beginCanvasConnection).mockResolvedValue({
      authorizationUrl: "https://usu.instructure.com/login/oauth2/auth?state=safe",
    });
    render(<CanvasConnectionPage />);
    expect(await screen.findByRole("button", { name: /Continue to Canvas/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue to Canvas/i }));
    await waitFor(() =>
      expect(beginCanvasConnection).toHaveBeenCalledWith("https://usu.instructure.com")
    );
  });
  it("keeps a connected account visible when the latest sync needs a retry", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({
      connected: true,
      status: "error",
      canvasUserName: "Bentley",
      lastSyncError: "Canvas timed out. Try again.",
      counts: { courses: 5, assignments: 18, exams: 3 },
    });
    vi.mocked(syncCanvas).mockRejectedValue(new Error("Canvas timed out. Try again."));
    render(<CanvasConnectionPage />);
    expect(await screen.findByText("Canvas connected")).toBeInTheDocument();
    expect(screen.getByText("Bentley")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Canvas timed out");
  });
});
