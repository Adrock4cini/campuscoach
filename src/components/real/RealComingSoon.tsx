/**
 * Fail-closed boundary for concept pages that are not backed by real data yet.
 *
 * Anonymous demo visitors may use the sample page. A signed-in student never
 * mounts it: several legacy sample pages still import authenticated data and
 * write clients directly, so hiding buttons inside those children is not a
 * sufficient account boundary.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export function RealComingSoon({ title, description, children }: Props) {
  const { mode } = useAuth();

  if (mode === "demo") return <>{children}</>;

  if (mode === "loading") {
    return (
      <div role="status" aria-label="Loading page" className="mx-auto max-w-3xl pt-8">
        <div className="h-72 animate-pulse rounded-3xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pt-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-dashed shadow-card">
          <CardContent className="space-y-5 p-8 text-center sm:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-calm">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
              <p className="mx-auto max-w-md text-muted-foreground">
                {description ??
                  "This feature is coming soon for your real classes. We’re connecting it to your actual coursework before turning it on."}
              </p>
            </div>

            <div role="note" className="mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Your account stays separate from sample data</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Interactive sample pages are hidden while you’re signed in, so sample actions cannot read or change your account.
                </p>
              </div>
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
