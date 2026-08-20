import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import { ClassShortcutRail } from "./ClassShortcutRail";
import { RealClassCard } from "./RealClassCard";

interface DashboardSurfaceProps {
  classes: ClassInfo[];
  coach: ReactNode;
  agenda: ReactNode;
  /** Stable "school at a glance" summary. Optional so demo mode can omit it. */
  glance?: ReactNode;
  sample?: boolean;
}

/** One dashboard information architecture, fed by either real or sample data. */
export function DashboardSurface({ classes, coach, agenda, glance, sample = false }: DashboardSurfaceProps) {
  return (
    <>
      <div className="space-y-4">
        {sample && <DemoDataNotice />}
        {coach}
        <ClassShortcutRail classes={classes} />
        {glance}
      </div>


      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-6">
        <aside className="order-1 self-start lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
          {agenda}
        </aside>

        <motion.section
          aria-labelledby="dashboard-classes-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="order-2 space-y-3 lg:col-start-1 lg:row-start-1"
        >
          <div className="flex items-baseline justify-between px-1">
            <h2 id="dashboard-classes-title" className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Your classes
            </h2>
            <span className="text-[11px] text-muted-foreground">{classes.length}</span>
          </div>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/65 shadow-sm backdrop-blur-md">
            {classes.map((classInfo, index) => (
              <RealClassCard key={classInfo.id} c={classInfo} index={index} />
            ))}
          </div>
          {!sample && (
            <div className="pt-2">
              <Link
                to="/classes/new"
                className="inline-flex min-h-11 items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add another class
              </Link>
            </div>
          )}
        </motion.section>
      </div>
    </>
  );
}

function DemoDataNotice() {
  return (
    <div
      role="note"
      aria-label="Demo information"
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs"
    >
      <span className="font-semibold text-primary">Demo mode · sample data</span>
      <span className="text-right text-muted-foreground">Changes aren’t saved to your account.</span>
    </div>
  );
}
