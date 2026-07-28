import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasAutoSync } from "./CanvasAutoSync";
import { getCanvasStatus, syncCanvas } from "@/lib/canvas/integration";

vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/today" }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real", user: { id: "student-1" } }),
}));
vi.mock("@/lib/canvas/integration", () => ({
  getCanvasStatus: vi.fn(),
  notifyCanvasDataChanged: vi.fn(),
  syncCanvas: vi.fn(),
}));

describe("CanvasAutoSync", () => {
  beforeEach(() => vi.clearAllMocks());
  it("quietly syncs a stale connected account", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({
      connected: true,
      status: "connected",
      lastSyncedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    });
    vi.mocked(syncCanvas).mockResolvedValue({ ok: true, partial: false });
    render(<CanvasAutoSync />);
    await waitFor(() => expect(syncCanvas).toHaveBeenCalledTimes(1));
  });
  it("does not sync again while the latest data is fresh", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({
      connected: true,
      status: "connected",
      lastSyncedAt: new Date().toISOString(),
    });
    render(<CanvasAutoSync />);
    await waitFor(() => expect(getCanvasStatus).toHaveBeenCalledTimes(1));
    expect(syncCanvas).not.toHaveBeenCalled();
  });
});
