import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClassCard } from "./ClassCard";
import { classes, exams, assignments, getDaysUntil } from "@/data/demo";
import { cn } from "@/lib/utils";

type Filter = "attention" | "due" | "lowest" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "attention", label: "Needs attention" },
  { id: "due",       label: "Due soon" },
  { id: "lowest",    label: "Lowest readiness" },
  { id: "all",       label: "All classes" },
];

export function ClassesGrid() {
  const [filter, setFilter] = useState<Filter>("attention");

  const sorted = useMemo(() => {
    const enriched = classes.map((c) => {
      const exam = exams
        .filter((e) => e.classId === c.id)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
      const nextAssign = assignments
        .filter((a) => a.classId === c.id && a.status !== "turned-in")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
      const examDays = exam ? getDaysUntil(exam.date) : Infinity;
      const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : Infinity;
      const attentionScore =
        (c.readiness < 60 ? 100 - c.readiness : 0) +
        (examDays <= 7 ? (8 - examDays) * 8 : 0) +
        (assignDays <= 2 ? (3 - assignDays) * 10 : 0);
      return { c, examDays, assignDays, attentionScore };
    });

    const cmp = {
      attention: (a: typeof enriched[0], b: typeof enriched[0]) => b.attentionScore - a.attentionScore,
      due:       (a: typeof enriched[0], b: typeof enriched[0]) => Math.min(a.examDays, a.assignDays) - Math.min(b.examDays, b.assignDays),
      lowest:    (a: typeof enriched[0], b: typeof enriched[0]) => a.c.readiness - b.c.readiness,
      all:       (a: typeof enriched[0], b: typeof enriched[0]) => a.c.name.localeCompare(b.c.name),
    }[filter];

    return [...enriched].sort(cmp).map((e) => e.c);
  }, [filter]);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/90">Your classes</p>
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight mt-1">
            What needs you today
          </h2>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-thin">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs whitespace-nowrap border backdrop-blur transition-all",
                  active
                    ? "border-primary/40 bg-primary/10 text-foreground shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                    : "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        layout
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {sorted.map((c, i) => (
          <ClassCard key={c.id} classId={c.id} index={i} />
        ))}
      </motion.div>
    </section>
  );
}
