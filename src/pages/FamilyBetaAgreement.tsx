import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveEntryRoute } from "@/lib/app/routeMemory";
import { useAuth } from "@/contexts/AuthContext";
import {
  consumePendingFamilyBetaAgreement,
} from "@/lib/legal/familyBeta";
import { toast } from "sonner";

export default function FamilyBetaAgreement() {
  const {
    user,
    loading,
    recovering,
    agreementStatus,
    refreshAgreement,
    acceptAgreement,
    signOut,
  } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const next = resolveEntryRoute((loc.state as { next?: string } | null)?.next);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && consumePendingFamilyBetaAgreement()) setAgreed(true);
  }, [user]);

  if (loading || recovering) {
    return <div role="status" className="py-20 text-center text-sm text-muted-foreground">Reconnecting to your account…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (agreementStatus === "accepted") return <Navigate to={next} replace />;

  const accept = async () => {
    if (!agreed) return;
    setBusy(true);
    try {
      const confirmed = await acceptAgreement();
      if (!confirmed) {
        toast.error("Couldn’t save your agreement", { description: "Check your connection and try again." });
        return;
      }
      nav(next, { replace: true });
    } catch {
      toast.error("Couldn’t save your agreement", { description: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await signOut();
      nav("/login", { replace: true });
    } catch {
      toast.error("Couldn’t sign out", { description: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <Card className="mx-auto max-w-lg shadow-elevated">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Invite-only family beta</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">One safety check before you continue</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This family beta currently supports students age 13 and older. Please do not create or use an account for a child under 13.
            </p>
          </div>
          {agreementStatus === "error" && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-muted-foreground">
              We couldn’t verify this account’s agreement yet. Check your connection, then retry the check or agree again.
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11 w-full"
                disabled={busy}
                onClick={() => { void refreshAgreement(); }}
              >
                Retry agreement check
              </Button>
            </div>
          )}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              I confirm the student using this account is at least 13. If I am their parent or guardian, I will supervise their beta use. I agree to the <Link className="text-primary hover:underline" to="/terms">beta terms</Link> and have read the <Link className="text-primary hover:underline" to="/privacy">privacy & safety notice</Link>.
            </span>
          </label>
          <Button className="h-12 w-full" disabled={!agreed || busy} onClick={() => { void accept(); }}>
            {busy ? "Saving…" : "Agree and continue"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={busy} onClick={() => { void leave(); }}>
            Sign out without agreeing
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
