import { useMemo } from "react";
import { motion } from "framer-motion";
import { MorningBrief } from "@/components/dashboard/MorningBrief";
import { TodaysFocus } from "@/components/dashboard/TodaysFocus";
import { TodaysPlan } from "@/components/dashboard/TodaysPlan";
import { ClassCommandCard } from "@/components/dashboard/ClassCommandCard";
import { CampusBrainInsightCard } from "@/components/intelligence/CampusBrainCard";
import { classes } from "@/data/demo";
import { useCampusBrainInsight, useClassPriorities } from "@/lib/intelligence";


/**
 * Dashboard — Class Command Center.
 *
 * Class order comes from the central Intelligence Engine
 * (`useClassPriorities`) so every screen agrees on which class
 * deserves attention first. No urgency math lives here.
 */
export default function Dashboard() {
  const priorities = useClassPriorities();
  const insight = useCampusBrainInsight();
  const ordered = useMemo(
    () =>
      priorities
        .map((p) => classes.find((c) => c.id === p.classId)!)
        .filter(Boolean),
    [priorities]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4 md:space-y-5">
      <MorningBrief />
      <CampusBrainInsightCard insight={insight} />
      <TodaysFocus />
      <TodaysPlan />



      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-between px-1"
      >
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Your classes
        </h2>
        <span className="text-[11px] text-muted-foreground">{ordered.length}</span>
      </motion.div>

      <div className="space-y-3 md:space-y-4">
        {ordered.map((c, i) => (
          <ClassCommandCard key={c.id} classId={c.id} index={i} />
        ))}
      </div>
    </div>
  );
}
