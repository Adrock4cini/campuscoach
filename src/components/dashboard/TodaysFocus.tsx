import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Flame, ArrowRight, Target } from "lucide-react";
import { classes, exams, assignments, getDaysUntil } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { cn } from "@/lib/utils";

/**
 * Compact "Today's Focus" — one class that needs the most attention.
 * Replaces the large hero. Designed to be readable in <5 seconds.
 */
export function TodaysFocus() {
  const navigate = useNavigate();

  // Attention score: low readiness + imminent exam/assignment
  const focus = [...classes]
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
      return { c, examDays, assignDays, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  const { c } = focus;
  const pulse = getClassPulse(c.id);
  const topic = pulse?.mostStruggled.topic ?? c.currentTopic;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl border border-border/50 glass shadow-elegant"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-16 -left-10 h-56 w-56 rounded-full bg-primary/25 blur-[100px]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-accent/20 blur-[100px]" />
      </div>

      <div className="relative p-5 md:p-6 flex items-center gap-4">
        <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0", c.color)}>
          <Target className="h-5 w-5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-primary/90">
            <Flame className="h-3 w-3" /> Today's focus
          </div>
          <h1 className="font-display text-xl md:text-2xl font-semibold text-foreground truncate mt-0.5">
            {c.name}
          </h1>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {c.readiness}% ready · {topic}
          </p>
        </div>

        <button
          onClick={() => navigate(`/focus-sprint?classId=${c.id}&duration=15`)}
          className="btn-glow h-11 px-5 rounded-2xl text-sm font-medium inline-flex items-center gap-1.5 shrink-0"
        >
          Start 15m
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </motion.section>
  );
}
