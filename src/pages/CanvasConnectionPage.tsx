import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  beginCanvasConnection,
  disconnectCanvas,
  getCanvasStatus,
  notifyCanvasDataChanged,
  syncCanvas,
  type CanvasConnectionStatus,
} from "@/lib/canvas/integration";

const DEFAULT_CANVAS_URL = "https://usu.instructure.com";

export default function CanvasConnectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callbackHandled = useRef(false);
  const [status, setStatus] = useState<CanvasConnectionStatus | null>(null);
  const [canvasUrl, setCanvasUrl] = useState(DEFAULT_CANVAS_URL);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const next = await getCanvasStatus();
      setStatus(next);
      if (next.canvasBaseUrl) setCanvasUrl(next.canvasBaseUrl);
      setError(next.lastSyncError || null);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canvas status could not be loaded.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const runSync = useCallback(async (quiet = false) => {
    setWorking("sync");
    setError(null);
    try {
      const result = await syncCanvas();
      notifyCanvasDataChanged();
      await loadStatus();
      if (!quiet) toast.success(result.partial ? "Canvas mostly synced" : "Canvas is up to date");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Canvas could not be synced.";
      setError(message);
      toast.error("Canvas sync stopped", { description: message });
      await loadStatus();
    } finally {
      setWorking(null);
    }
  }, [loadStatus]);

  useEffect(() => {
    void (async () => {
      const next = await loadStatus();
      if (callbackHandled.current) return;
      callbackHandled.current = true;
      const callback = searchParams.get("canvas");
      if (callback === "connected" && next?.connected) {
        navigate("/integrations/canvas", { replace: true });
        await runSync(true);
        toast.success("Canvas connected", {
          description: "Your classes and deadlines were imported.",
        });
      } else if (callback === "error") {
        navigate("/integrations/canvas", { replace: true });
        setError("Canvas sign-in could not be completed. Nothing was imported.");
      }
    })();
  }, [loadStatus, navigate, runSync, searchParams]);

  const connect = async () => {
    setWorking("connect");
    setError(null);
    try {
      const result = await beginCanvasConnection(canvasUrl);
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canvas connection could not start.");
      setWorking(null);
    }
  };

  const disconnect = async () => {
    setWorking("disconnect");
    setError(null);
    try {
      await disconnectCanvas();
      notifyCanvasDataChanged();
      setStatus({ connected: false, status: "disconnected" });
      toast.success("Canvas disconnected", {
        description: "Your notes and study history remain in Campus Companion.",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canvas could not be disconnected.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90">
          <Link2 className="h-3.5 w-3.5" /> Connected learning
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Canvas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring your real classes and deadlines into one plan.
        </p>
      </div>

      <Card className="overflow-hidden rounded-[26px] border-border/50 bg-card/75 shadow-card backdrop-blur-md">
        <CardContent className="p-5 sm:p-6">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Checking Canvas…
            </div>
          ) : status?.connected ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-semibold">Canvas connected</h2>
                    <Badge variant="outline" className="border-success/30 text-[10px] text-success">
                      Read only
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {status.canvasUserName || "Your school account"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <SyncCount label="Classes" value={status.counts?.courses} />
                <SyncCount label="Assignments" value={status.counts?.assignments} />
                <SyncCount label="Tests" value={status.counts?.exams} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="h-11 flex-1 rounded-xl"
                  onClick={() => void runSync()}
                  disabled={working !== null}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${working === "sync" ? "animate-spin" : ""}`} />
                  Sync now
                </Button>
                {status.canvasBaseUrl && (
                  <Button variant="outline" className="h-11 rounded-xl" asChild>
                    <a href={status.canvasBaseUrl} target="_blank" rel="noreferrer">
                      Open Canvas <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
                <p className="text-xs text-muted-foreground">{formatLastSync(status.lastSyncedAt)}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void disconnect()}
                  disabled={working !== null}
                >
                  <Unplug className="mr-1.5 h-3.5 w-3.5" /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Connect your school</h2>
                <p className="text-sm text-muted-foreground">
                  Import courses, assignments, quizzes, tests, and due dates.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="canvas-url">School Canvas address</Label>
                <Input
                  id="canvas-url"
                  inputMode="url"
                  autoCapitalize="none"
                  value={canvasUrl}
                  onChange={(event) => setCanvasUrl(event.target.value)}
                  placeholder="https://school.instructure.com"
                  className="h-12 rounded-xl"
                />
              </div>
              <Button
                className="h-12 w-full rounded-xl bg-gradient-calm"
                onClick={() => void connect()}
                disabled={working !== null || !canvasUrl.trim()}
              >
                {working === "connect"
                  ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  : <Link2 className="mr-2 h-4 w-4" />}
                Continue to Canvas
              </Button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm"
            >
              {error}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-start gap-2.5 rounded-2xl border border-border/40 p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Campus Companion can only read the coursework you authorize. It cannot submit work,
          change grades, or see another student’s information.
        </p>
      </div>
    </div>
  );
}

function SyncCount({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/25 px-2 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value ?? "—"}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    </div>
  );
}
function formatLastSync(value?: string | null) {
  if (!value) return "Ready for first sync";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently synced";
  return `Last synced ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
