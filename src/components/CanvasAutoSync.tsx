import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCanvasStatus,
  notifyCanvasDataChanged,
  syncCanvas,
  syncCanvasCalendar,
} from "@/lib/canvas/integration";
import { isCanvasConnectEnabled } from "@/lib/canvas/feature";

const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function CanvasAutoSync() {
  const { mode, user } = useAuth();
  const location = useLocation();
  const isCanvasPage = location.pathname === "/integrations/canvas";
  const canvasConnectEnabled = isCanvasConnectEnabled();

  useEffect(() => {
    if (!canvasConnectEnabled || mode !== "real" || !user?.id || isCanvasPage) return;
    let cancelled = false;
    void (async () => {
      const status = await getCanvasStatus();
      if (
        cancelled || !status.connected || status.status === "needs_reauth" ||
        status.lastSyncStatus === "syncing"
      ) return;
      const lastSync = status.lastSyncedAt ? Date.parse(status.lastSyncedAt) : Number.NaN;
      if (Number.isFinite(lastSync) && Date.now() - lastSync < AUTO_SYNC_INTERVAL_MS) return;
      if (status.method === "calendar") await syncCanvasCalendar();
      else await syncCanvas();
      if (!cancelled) notifyCanvasDataChanged();
    })().catch(() => {
      // Background sync never interrupts study; the Canvas page has retry controls.
    });
    return () => {
      cancelled = true;
    };
  }, [canvasConnectEnabled, isCanvasPage, mode, user?.id]);
  return null;
}
