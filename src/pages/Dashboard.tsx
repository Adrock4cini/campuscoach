import { useMemo } from "react";
import { motion } from "framer-motion";
import { TodaysFocus } from "@/components/dashboard/TodaysFocus";
import { ClassCommandCard } from "@/components/dashboard/ClassCommandCard";
import { classes, exams, assignments, getDaysUntil } from "@/data/demo";

/**
 * Dashboard — Class Command Center.
 * Optimized for a 15-second glance between classes:
 * 1. One "Today's Focus" card up top.
 * 2. Vertically stacked, expandable Class Command Cards.
 * No paragraphs, no filler — icons and color coding do the talking.
 */
export default function Dashboard() {
  // Order classes by attention score so the most urgent is first.
  const ordered = useMemo(() => {
    return [...classes]
      .map((c) => {
        const exam = exams
          .filter((e) => e.classId === c.id)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        const assign = assignments
          .filter((a) => a.classId === c.id && a.status !== "turned-in")
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
        const examDays = exam ? getDaysUntil(exam.date) : 99;
        const assignDays = assign ? getDaysUntil(assign.dueDate) : 99;
        const score =
          (100 - c.readiness) +
          (examDays <= 7 ? (8 - examDays) * 10 : 0) +
          (assignDays <= 3 ? (4 - assignDays) * 8 : 0);
        return { c, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-4 md:space-y-5">
      <TodaysFocus />

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
