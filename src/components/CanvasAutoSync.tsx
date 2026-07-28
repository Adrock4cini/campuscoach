import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCanvasStatus,
  notifyCanvasDataChanged,
  syncCanvas,
} from "@/lib/canvas/integration";

const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function CanvasAutoSync() {
  const { mode, user } = useAuth();
  const location = useLocation();
  const isCanvasPage = location.pathname === "/integrations/canvas";

  useEffect(() => {
    if (mode !== "real" || !user?.id || isCanvasPage) return;
    let cancelled = false;
    void (async () => {
      const status = await getCanvasStatus();
      if (
        cancelled || !status.connected || status.status === "needs_reauth" ||
        status.lastSyncStatus === "syncing"
      ) return;
      const lastSync = status.lastSyncedAt ? Date.parse(status.lastSyncedAt) : Number.NaN;
      if (Number.isFinite(lastSync) && Date.now() - lastSync < AUTO_SYNC_INTERVAL_MS) return;
      await syncCanvas();
      if (!cancelled) notifyCanvasDataChanged();
    })().catch(() => {
      // Background sync never interrupts study; the Canvas page has retry controls.
    });
    return () => {
      cancelled = true;
    };
  }, [isCanvasPage, mode, user?.id]);
  return null;
}
