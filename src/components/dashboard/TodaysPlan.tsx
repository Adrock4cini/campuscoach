import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Timer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classes, exams, assignments, getDaysUntil } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { cn } from "@/lib/utils";

interface PlanItem {
  id: string;
  classId: string;
  className: string;
  color: string;
  task: string;
  minutes: number;
}

function buildPlan(): PlanItem[] {
  const items: PlanItem[] = [];

  classes.forEach((c) => {
    const exam = exams
      .filter((e) => e.classId === c.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const nextAssign = assignments
      .filter((a) => a.classId === c.id && a.status !== "turned-in")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    const pulse = getClassPulse(c.id);

    const examDays = exam ? getDaysUntil(exam.date) : Infinity;
    const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : Infinity;

    let task = "";
    let minutes = 0;

    if (assignDays <= 2 && nextAssign) {
      task = `Outline "${nextAssign.title}"`;
      minutes = 15;
    } else if (examDays <= 7 && c.readiness < 70) {
      const topic = pulse?.mostStruggled.topic ?? c.currentTopic;
      task = `Practice ${topic}`;
      minutes = c.readiness < 50 ? 15 : 10;
    } else if (c.readiness < 75) {
      task = `Review ${c.currentTopic} flashcards`;
      minutes = 8;
    } else {
      return; // skip — already on track
    }

    items.push({
      id: c.id,
      classId: c.id,
      className: c.name,
      color: c.color,
      task,
      minutes,
    });
  });

  // Sort by urgency (assignments first, then exam-readiness gap)
  return items.slice(0, 4);
}

export function TodaysPlan() {
  const navigate = useNavigate();
  const plan = buildPlan();
  const total = plan.reduce((s, p) => s + p.minutes, 0);

  if (plan.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/90">Today's plan</p>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-foreground tracking-tight mt-1">
            ~{total} min to catch up
          </h2>
        </div>
        <Button
          size="sm"
          onClick={() => navigate(`/focus-sprint?classId=${plan[0].classId}&duration=${plan[0].minutes}`)}
          className="rounded-full h-9 px-4 bg-gradient-calm border-0 text-primary-foreground hover:opacity-95"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Start plan
        </Button>
      </div>

      <ol className="space-y-2">
        {plan.map((p, i) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <button
              onClick={() => navigate(`/focus-sprint?classId=${p.classId}&duration=${p.minutes}`)}
              className="w-full text-left flex items-center gap-3 rounded-xl border border-border/40 glass px-4 py-3 hover:border-border/80 transition-colors group"
            >
              <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", p.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  <span className="text-muted-foreground">{p.className.split(" ").slice(0, 2).join(" ")}</span>
                  {" · "}
                  {p.task}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                {p.minutes}m
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
