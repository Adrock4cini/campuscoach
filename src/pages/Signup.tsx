import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  clearPendingOAuthAgreement,
  familyBetaMetadata,
  isFamilyBetaStaging,
  publicSignupsEnabled,
  publicSupportEmail,
  rememberPendingOAuthAgreement,
} from "@/lib/legal/familyBeta";

export default function Signup() {
  return publicSignupsEnabled() ? <OpenBetaSignup /> : <ClosedBetaSignup />;
}

function OpenBetaSignup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      return toast.error("Password too short", { description: "Use at least 8 characters." });
    }
    if (!agreed) return toast.error("Complete the family beta safety check first");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: familyBetaMetadata(),
        },
      });
      if (error) return toast.error("Couldn't create account", { description: error.message });
      if (data.session) {
        // Auto-confirm is on for beta — go straight to onboarding.
        nav("/onboarding", { replace: true });
      } else {
        toast.success("Check your email", { description: "Click the confirmation link, then sign in." });
        nav("/login", { replace: true });
      }
    } catch {
      toast.error("Couldn't create account", { description: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    if (!agreed) return toast.error("Complete the family beta safety check first");
    setBusy(true);
    rememberPendingOAuthAgreement();
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        clearPendingOAuthAgreement();
        toast.error("Google sign-in failed", { description: String(result.error) });
      }
    } catch {
      clearPendingOAuthAgreement();
      toast.error("Google sign-in failed", { description: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {isFamilyBetaStaging() && (
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              Family Beta · staging
            </p>
          )}
          <h1 className="font-display text-3xl font-semibold">Create family beta account</h1>
          <p className="text-sm text-muted-foreground mt-1">Private family test of Campus Companion</p>
        </div>
        <Card className="shadow-elevated">
          <CardContent className="p-6 space-y-4">
            {isFamilyBetaStaging() && (
              <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                This is the private staging app, separate from the public Campus Coach. Real class syllabi and school work are
                fine to upload for this family test. If email confirmation is ever turned on here, we&apos;ll tell you to open the
                confirmation link before signing in — otherwise your account works right away.
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={() => { void onGoogle(); }} disabled={busy || !agreed}>
              Continue with Google
            </Button>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} />
                <p className="text-[11px] text-muted-foreground">At least 8 characters. We block leaked passwords.</p>
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3 text-xs leading-relaxed text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>
                  I confirm the student using this account is at least 13. If I am their parent or guardian, I will supervise their beta use. I agree to the <Link className="text-primary hover:underline" to="/terms">beta terms</Link> and have read the <Link className="text-primary hover:underline" to="/privacy">privacy & safety notice</Link>.
                </span>
              </label>
              <Button type="submit" className="w-full bg-gradient-calm border-0 text-primary-foreground" disabled={busy || !agreed}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </form>
            <div className="text-xs text-center">
              <Link to="/login" className="text-muted-foreground hover:text-foreground">
                Already have an account? <span className="text-primary">Sign in</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClosedBetaSignup() {
  const supportEmail = publicSupportEmail();
  return (
    <main className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardContent className="space-y-5 p-6 text-center sm:p-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Limited family beta</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">New accounts are created by invitation</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We are setting up one family at a time while school starts. If you were invited, ask the beta organizer to create your account, then sign in.
            </p>
          </div>
          {supportEmail && (
            <a className="inline-flex min-h-11 items-center justify-center text-sm text-primary hover:underline" href={`mailto:${supportEmail}`}>
              Contact the beta organizer
            </a>
          )}
          <Button asChild className="h-12 w-full">
            <Link to="/login">Sign in</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            For students age 13 and older. Read the <Link className="text-primary hover:underline" to="/privacy">privacy notice</Link> and <Link className="text-primary hover:underline" to="/terms">beta terms</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
