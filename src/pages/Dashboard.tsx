import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Sparkles, Plus } from "lucide-react";
import { TopStrip } from "@/components/dashboard/TopStrip";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useAuth } from "@/contexts/AuthContext";
import { RealTodaysPlan } from "@/components/real/RealTodaysPlan";
import { RealSchoolAtAGlance } from "@/components/real/RealSchoolAtAGlance";
import { RealWeekAhead } from "@/components/real/RealWeekAhead";
import { RealUrgentAttention } from "@/components/real/RealUrgentAttention";
import { useRealClassAlerts } from "@/components/real/RealClassAlerts";

import { RealCoachHero } from "@/components/dashboard/RealCoachHero";
import { DemoCoachHero } from "@/components/dashboard/DemoCoachHero";
import { DemoTodaysPlan } from "@/components/dashboard/DemoTodaysPlan";
import { DashboardSurface } from "@/components/dashboard/DashboardSurface";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { buildDemoDashboardModel } from "@/lib/demo/dashboardSampleAdapter";

/**
 * Dashboard — the intelligent home screen.
 *
 * ONE source of truth: authenticated users see ONLY their own data.
 * Demo content is shown exclusively for anonymous visitors or when
 * Demo Mode has been explicitly enabled.
 */
export default function Dashboard() {
  const { mode } = useAuth();
  const { classes: myClasses, loading, error: classesError, reload: reloadClasses } = useMyClasses();

  // Single source of truth: `mode` decides demo-vs-real for EVERY widget below.
  const realMode = mode === "real";
  const demoMode = mode === "demo";


  const demoModel = useMemo(
    () => demoMode ? buildDemoDashboardModel() : null,
    [demoMode],
  );
  const ordered = realMode ? myClasses : demoModel?.classes ?? [];
  const classAlerts = useRealClassAlerts(realMode ? ordered : []);

  // In real mode with no classes yet → show empty state, hide demo-derived widgets.
  const hasNoRealData = realMode && !loading && ordered.length === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-7 md:space-y-8">
      <TopStrip />

      {mode === "loading" ? (
        <DashboardLoadingState />
      ) : realMode && !loading && classesError ? (
        <ClassesLoadError onRetry={() => void reloadClasses()} />
      ) : hasNoRealData ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] border border-primary/30 glass shadow-elegant p-8 md:p-12 text-center"
        >
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-calm flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Let&apos;s set up your term
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md mx-auto">
            Add your first class so Campus Brain can start building your dashboard, plan, and readiness scores from your real classwork.
          </p>
          <Link
            to="/classes/new"
            className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-gradient-calm text-primary-foreground font-semibold shadow-elegant hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add your first class
          </Link>
        </motion.section>
      ) : realMode ? (
        <RealMobileDashboard classes={ordered} classesLoading={loading} />
      ) : (
        <DashboardSurface
          classes={ordered}
          sample={demoMode}
          classAlerts={classAlerts}
          coach={demoModel ? <DemoCoachHero model={demoModel} /> : null}
          agenda={demoModel ? <DemoTodaysPlan agenda={demoModel.agenda} /> : null}
        />

      )}

    </div>
  );
}

function DashboardLoadingState() {
  return (
    <div role="status" className="space-y-4" aria-label="Loading dashboard">
      <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
      <div className="h-72 animate-pulse rounded-[30px] bg-muted/40" />
    </div>
  );
}
