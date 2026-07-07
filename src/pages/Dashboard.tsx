import { useMemo } from "react";
import { motion } from "framer-motion";
import { CompactGreeting } from "@/components/dashboard/CompactGreeting";
import { DoThisNowHero } from "@/components/dashboard/DoThisNowHero";
import { TodaysChecklist } from "@/components/dashboard/TodaysChecklist";
import { ClassQuickCard } from "@/components/dashboard/ClassQuickCard";
import { RealClassCard } from "@/components/dashboard/RealClassCard";
import { BrainOneLiner } from "@/components/dashboard/BrainOneLiner";
import { classes as demoClasses } from "@/data/demo";
import { useCampusBrainInsight, useClassPriorities } from "@/lib/intelligence";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";

/**
 * Dashboard — the product.
 *
 * Visual hierarchy:
 *   1. Do This Now  (dominant)
 *   2. Today's Plan (checklist)
 *   3. Classes      (quick access)
 *   4. Campus Brain (one sentence)
 *
 * Every decision — the recommendation, its time estimate, its impact,
 * and the class ordering — comes from the Learning Engine. This page
 * only arranges what the engine returns.
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
    <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
      <CompactGreeting />

      {/* 1. THE MISSION */}
      {!isReal && <DoThisNowHero />}

      {/* 2. TODAY'S PLAN */}
      {!isReal && <TodaysChecklist />}

      {/* 3. CLASSES */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
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

      {/* 4. CAMPUS BRAIN */}
      {!isReal && <BrainOneLiner insight={insight} />}
    </div>
  );
}
