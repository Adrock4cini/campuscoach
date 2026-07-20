import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      return toast.error("Password too short", { description: "Use at least 8 characters." });
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return toast.error("Couldn't create account", { description: error.message });
    if (data.session) {
      // Auto-confirm is on for beta — go straight to onboarding.
      nav("/onboarding", { replace: true });
    } else {
      toast.success("Check your email", { description: "Click the confirmation link, then sign in." });
      nav("/login", { replace: true });
    }
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed", { description: String(result.error) });
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1">Start using Campus Companion in under 5 minutes</p>
        </div>
        <Card className="shadow-elevated">
          <CardContent className="p-6 space-y-4">
            <Button variant="outline" className="w-full" onClick={onGoogle}>
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
              <Button type="submit" className="w-full bg-gradient-calm border-0 text-primary-foreground" disabled={busy}>
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
