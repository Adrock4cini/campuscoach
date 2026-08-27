import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasAutoSync } from "./CanvasAutoSync";
import { getCanvasStatus, syncCanvas, syncCanvasCalendar } from "@/lib/canvas/integration";

const canvasFeature = vi.hoisted(() => ({ enabled: true }));

vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/today" }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ mode: "real", user: { id: "student-1" } }),
}));
vi.mock("@/lib/canvas/integration", () => ({
  getCanvasStatus: vi.fn(),
  notifyCanvasDataChanged: vi.fn(),
  syncCanvas: vi.fn(),
  syncCanvasCalendar: vi.fn(),
}));
vi.mock("@/lib/canvas/feature", () => ({
  isCanvasConnectEnabled: () => canvasFeature.enabled,
}));

describe("CanvasAutoSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canvasFeature.enabled = true;
  });

  it("does not inspect or sync Canvas when the launch flag is off", async () => {
    canvasFeature.enabled = false;
    render(<CanvasAutoSync />);

    await Promise.resolve();
    expect(getCanvasStatus).not.toHaveBeenCalled();
    expect(syncCanvas).not.toHaveBeenCalled();
    expect(syncCanvasCalendar).not.toHaveBeenCalled();
  });
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
  it("quietly refreshes a calendar fallback connection", async () => {
    vi.mocked(getCanvasStatus).mockResolvedValue({
      connected: true,
      status: "connected",
      method: "calendar",
      lastSyncedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    });
    vi.mocked(syncCanvasCalendar).mockResolvedValue({ ok: true });
    render(<CanvasAutoSync />);
    await waitFor(() => expect(syncCanvasCalendar).toHaveBeenCalledTimes(1));
    expect(syncCanvas).not.toHaveBeenCalled();
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
