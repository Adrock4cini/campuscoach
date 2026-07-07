import { useMemo } from "react";
import { motion } from "framer-motion";
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

/**
 * Dashboard — the intelligent home screen.
 *
 * Hierarchy (optimized for a 5-second glance between classes):
 *   1. Top strip     — greeting · momentum · search · notifications
 *   2. DO THIS NOW   — one recommendation, one CTA, full visual weight
 *   3. Split row     — Your Classes (left)   |   Today's Plan (right)
 *   4. Brain insight — one sentence
 *   5. Bottom bar    — streak · momentum · trend · celebration
 *
 * The dashboard is a presentation layer only; every decision comes
 * from the existing Learning Engine.
 */
export default function Dashboard() {
  const priorities = useClassPriorities();
  const insight = useCampusBrainInsight();
  const { classes: myClasses, isReal } = useMyClasses();
  const ordered = useMemo(() => {
    if (isReal) return myClasses;
    return priorities
      .map((p) => demoClasses.find((c) => c.id === p.classId)!)
      .filter(Boolean);
  }, [priorities, myClasses, isReal]);

  return (
    <div className="max-w-6xl mx-auto space-y-5 md:space-y-6">
      {/* Row 1 — compact top strip */}
      <TopStrip />

      {/* Row 2 — Do This Now hero */}
      {!isReal && <DoThisNowHero />}

      {/* Row 3 — Your Classes (left) + Today's Plan (right) */}
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
              isReal ? (
                <RealClassCard key={c.id} c={c} index={i} />
              ) : (
                <ClassQuickCard key={c.id} classId={c.id} index={i} />
              )
            )}
          </div>
        </motion.section>

        {!isReal && (
          <aside className="space-y-4 lg:sticky lg:top-4 self-start">
            <TodaysChecklist />
            <BrainOneLiner insight={insight} />
          </aside>
        )}
      </div>

      {/* Row 5 — habit bar */}
      {!isReal && <BottomBar />}
    </div>
  );
}
