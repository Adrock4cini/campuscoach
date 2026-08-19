import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanvasConnectionPage from "./CanvasConnectionPage";
import {
  beginCanvasConnection,
  connectCanvasCalendar,
  getCanvasStatus,
  syncCanvas,
} from "@/lib/canvas/integration";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("@/lib/canvas/integration", () => ({
  beginCanvasConnection: vi.fn(),
  connectCanvasCalendar: vi.fn(),
  disconnectCanvas: vi.fn(),
  getCanvasStatus: vi.fn(),
  notifyCanvasDataChanged: vi.fn(),
  syncCanvas: vi.fn(),
  syncCanvasCalendar: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Canvas connection", () => {
  beforeEach(() => vi.clearAllMocks());
  it("starts blank and uses the school's secure Canvas sign-in without asking for a password", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({ connected: false, status: "disconnected" });
    vi.mocked(beginCanvasConnection).mockResolvedValue({
      authorizationUrl: "https://district.instructure.com/login/oauth2/auth?state=safe",
    });
    render(<CanvasConnectionPage />);
    const connectButton = await screen.findByRole("button", { name: /Continue to Canvas/i });
    const address = screen.getByLabelText(/School Canvas address/i);
    expect(address).toHaveValue("");
    expect(connectButton).toBeDisabled();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    fireEvent.change(address, { target: { value: "https://district.instructure.com" } });
    fireEvent.click(connectButton);
    await waitFor(() =>
      expect(beginCanvasConnection).toHaveBeenCalledWith("https://district.instructure.com")
    );
  });
  it("makes Canvas optional and keeps manual setup prominent", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({ connected: false, status: "disconnected" });
    render(<CanvasConnectionPage />);

    expect(await screen.findByText(/if your school uses Canvas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Set up classes manually/i }));
    expect(navigate).toHaveBeenCalledWith("/classes");
    expect(screen.getByRole("button", { name: /Use Canvas calendar feed/i })).toBeInTheDocument();
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
    expect(await screen.findByText("School connected")).toBeInTheDocument();
    expect(screen.getByText("Bentley")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Canvas timed out");
  });
  it("offers a simple calendar fallback without asking for a token", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({ connected: false, status: "disconnected" });
    vi.mocked(connectCanvasCalendar).mockResolvedValue({
      ok: true,
      connected: true,
      lastSyncedAt: "2026-07-30T12:00:00Z",
    });
    render(<CanvasConnectionPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Use Canvas calendar feed/i }));
    const input = screen.getByPlaceholderText(/private Canvas calendar link/i);
    fireEvent.change(input, {
      target: {
        value: "https://usu.instructure.com/feeds/calendars/user_secret.ics",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import my calendar/i }));
    await waitFor(() =>
      expect(connectCanvasCalendar).toHaveBeenCalledWith(
        "https://usu.instructure.com/feeds/calendars/user_secret.ics",
      )
    );
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
  });
});
