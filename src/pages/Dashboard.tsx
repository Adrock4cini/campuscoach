import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Sparkles, Plus } from "lucide-react";
import { TopStrip } from "@/components/dashboard/TopStrip";
import { DoThisNowHero } from "@/components/dashboard/DoThisNowHero";
import { TodaysChecklist } from "@/components/dashboard/TodaysChecklist";
import { ClassQuickCard } from "@/components/dashboard/ClassQuickCard";
import { RealClassCard } from "@/components/dashboard/RealClassCard";
import { BrainOneLiner } from "@/components/dashboard/BrainOneLiner";
import { BottomBar } from "@/components/dashboard/BottomBar";
import { classes as demoClasses } from "@/data/demo";
import { useCampusBrainInsight, useClassPriorities } from "@/lib/intelligence";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useAuth } from "@/contexts/AuthContext";
import { RealTodaysPlan } from "@/components/real/RealTodaysPlan";

/**
 * Dashboard — the intelligent home screen.
 *
 * ONE source of truth: authenticated users see ONLY their own data.
 * Demo content is shown exclusively for anonymous visitors or when
 * Demo Mode has been explicitly enabled.
 */
export default function Dashboard() {
  const { user, isDemoMode } = useAuth();
  const priorities = useClassPriorities();
  const insight = useCampusBrainInsight();
  const { classes: myClasses, isReal, loading } = useMyClasses();

  // Real mode = authenticated user and NOT explicit demo mode.
  const realMode = !!user && !isDemoMode;

  const ordered = useMemo(() => {
    if (realMode) return myClasses;
    return priorities
      .map((p) => demoClasses.find((c) => c.id === p.classId)!)
      .filter(Boolean);
  }, [priorities, myClasses, realMode]);

  // In real mode with no classes yet → show empty state, hide demo-derived widgets.
  const hasNoRealData = realMode && !loading && ordered.length === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-5 md:space-y-6">
      <TopStrip />

      {hasNoRealData ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] border border-primary/30 glass shadow-elegant p-8 md:p-12 text-center"
        >
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-calm flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Let's set up your semester
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md mx-auto">
            Add your first class so Campus Brain can start building your dashboard, plan, and readiness scores from your real coursework.
          </p>
          <Link
            to="/onboarding"
            className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-gradient-calm text-primary-foreground font-semibold shadow-elegant hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add your first class
          </Link>
        </motion.section>
      ) : (
        <>
          {/* Do This Now — demo-derived, hidden for real users */}
          {!realMode && <DoThisNowHero />}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-5">
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="space-y-2"
            >
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-medium text-foreground/80">Your classes</h2>
                <span className="text-[11px] text-muted-foreground">{ordered.length}</span>
              </div>
              <div className="space-y-2">
                {ordered.map((c, i) =>
                  realMode ? (
                    <RealClassCard key={c.id} c={c} index={i} />
                  ) : (
                    <ClassQuickCard key={c.id} classId={c.id} index={i} />
                  )
                )}
              </div>
              {realMode && (
                <div className="pt-2">
                  <Link
                    to="/onboarding"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Add another class
                  </Link>
                </div>
              )}
            </motion.section>

            <aside className="space-y-4 lg:sticky lg:top-4 self-start">
              {!realMode && <TodaysChecklist />}
              {!realMode && <BrainOneLiner insight={insight} />}
              {realMode && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Next up</p>
                  <p className="text-xs">
                    Use Quick Capture on any class page to record a lecture, scan the board, or drop a note. Campus Brain will build Today's Plan from your real captures.
                  </p>
                </div>
              )}
            </aside>
          </div>

          {!realMode && <BottomBar />}
        </>
      )}
    </div>
  );
}
