/**
 * RealComingSoon
 *
 * Wraps a page's demo content. For real (signed-in, non-demo) users, renders
 * a polished "Coming soon for your real classes" state by default with a
 * "View demo version" button that reveals the underlying demo content.
 *
 * For anonymous / demo-mode visitors, renders `children` directly so the
 * demo tour is unchanged.
 */
import { useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Eye, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export function RealComingSoon({ title, description, children }: Props) {
  const { user, isDemoMode } = useAuth();
  const realMode = !!user && !isDemoMode;
  const [showDemo, setShowDemo] = useState(false);

  if (!realMode) return <>{children}</>;

  if (showDemo) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Viewing demo preview — not your real data
          </span>
          <Button size="sm" variant="ghost" onClick={() => setShowDemo(false)}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-card border-dashed">
          <CardContent className="p-10 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-gradient-calm flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-semibold text-foreground">
                {title}
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                {description ??
                  "This feature is coming soon for your real classes. We're wiring it up to your actual data — check back shortly."}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDemo(true)}>
                <Eye className="h-3.5 w-3.5 mr-1.5" /> View demo version
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70">
              The demo version uses sample data and won't affect your account.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
