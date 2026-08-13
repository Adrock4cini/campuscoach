import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Keeps account-backed setup screens out of sample mode without turning a
 * visible demo action into a confusing redirect.
 */
export function RealOnly({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;

  if (mode === "real") return <>{children}</>;

  if (mode === "loading") {
    return (
      <div role="status" aria-label="Checking account" className="mx-auto max-w-2xl pt-8">
        <div className="h-64 animate-pulse rounded-3xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <Card className="border-dashed shadow-card">
        <CardContent className="space-y-5 p-8 text-center sm:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold text-foreground">
              Sign in to use this account feature
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              The demo stays device-only. Sign in or create an account to save classes, connect Canvas, or import a syllabus.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link to="/login" state={{ next }}>Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/signup">Create account</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
