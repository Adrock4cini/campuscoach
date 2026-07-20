import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { enableDemoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const next = (loc.state as { next?: string } | null)?.next ?? "/";

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Sign in failed", { description: error.message });
    nav(next, { replace: true });
  }

  async function onGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed", { description: String(result.error) });
    // On success the popup/redirect finishes and onAuthStateChange takes over.
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to Campus Companion</p>
        </div>
        <Card className="shadow-elevated">
          <CardContent className="p-6 space-y-4">
            <Button variant="outline" className="w-full" onClick={onGoogle}>
              Continue with Google
            </Button>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
            <form className="space-y-3" onSubmit={onEmailSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full bg-gradient-calm border-0 text-primary-foreground" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="flex items-center justify-between text-xs">
              <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">Forgot password?</Link>
              <Link to="/signup" className="text-primary hover:underline">Create account</Link>
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              enableDemoMode();
              nav("/dashboard", { replace: true });
            }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Continue as demo
          </Button>
        </div>
      </div>
    </div>
  );
}
