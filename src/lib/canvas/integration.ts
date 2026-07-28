import { supabase } from "@/integrations/supabase/client";

export interface CanvasSyncCounts {
  courses?: number;
  assignments?: number;
  exams?: number;
}
export interface CanvasConnectionStatus {
  connected: boolean;
  status: "disconnected" | "connected" | "needs_reauth" | "error";
  canvasBaseUrl?: string;
  canvasUserName?: string | null;
  lastSyncStatus?: "never" | "syncing" | "success" | "partial" | "error";
  lastSyncError?: string | null;
  lastSyncedAt?: string | null;
  counts?: CanvasSyncCounts;
}
export class CanvasIntegrationError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "CanvasIntegrationError";
  }
}
export async function getCanvasStatus() {
  return invoke<CanvasConnectionStatus>("status");
}
export async function beginCanvasConnection(canvasBaseUrl: string) {
  const { data, error } = await supabase.functions.invoke("canvas-connect", {
    body: { canvasBaseUrl: canvasBaseUrl.trim() },
  });
  if (error) throw await parseError(error);
  const response = data as { authorizationUrl?: string };
  if (!response?.authorizationUrl) {
    throw new CanvasIntegrationError("Canvas did not return a secure sign-in address.");
  }
  return response as { authorizationUrl: string; institution?: string };
}
export async function syncCanvas() {
  return invoke<{
    ok: boolean;
    partial?: boolean;
    lastSyncedAt?: string;
    counts?: CanvasSyncCounts;
  }>("sync");
}
export async function disconnectCanvas() {
  return invoke<{ ok: boolean; connected: false }>("disconnect");
}
export function notifyCanvasDataChanged() {
  window.dispatchEvent(new CustomEvent("coach:refresh"));
  window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  window.dispatchEvent(new CustomEvent("real-exams:changed"));
}
async function invoke<T>(action: "status" | "sync" | "disconnect"): Promise<T> {
  const { data, error } = await supabase.functions.invoke("canvas-sync", {
    body: { action },
  });
  if (error) throw await parseError(error);
  return data as T;
}
async function parseError(error: unknown): Promise<CanvasIntegrationError> {
  const fallback = error instanceof Error ? error.message : "Canvas connection failed.";
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; code?: unknown };
      if (typeof payload.error === "string") {
        return new CanvasIntegrationError(
          payload.error,
          typeof payload.code === "string" ? payload.code : undefined,
        );
      }
    } catch {
      // Use the SDK fallback.
    }
  }
  return new CanvasIntegrationError(fallback);
}
