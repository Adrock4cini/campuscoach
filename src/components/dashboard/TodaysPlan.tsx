import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Timer, Sparkles, Trophy, Flame } from "lucide-react";
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
  highYield: boolean;
  xp: number;
}

/**
 * Build a short, ADHD-friendly plan: only the next 4 most-impactful actions.
 * Each item is a tiny burst (8–15 min) with a clear reward.
 * High-yield tasks earn extra XP to nudge attention to what matters most.
 */
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
    let highYield = false;

    if (assignDays <= 2 && nextAssign) {
      task = `Outline "${nextAssign.title}"`;
      minutes = 15;
    } else if (examDays <= 7 && c.readiness < 70) {
      const topic = pulse?.mostStruggled.topic ?? c.currentTopic;
      task = `Practice ${topic}`;
      minutes = c.readiness < 50 ? 15 : 10;
      highYield = !!pulse;
    } else if (c.readiness < 75) {
      task = `Review ${c.currentTopic} flashcards`;
      minutes = 8;
    } else {
      return; // already on track
    }

    items.push({
      id: c.id,
      classId: c.id,
      className: c.name,
      color: c.color,
      task,
      minutes,
      highYield,
      xp: highYield ? 25 : 15,
    });
  });

  return items.slice(0, 4);
}

export function TodaysPlan() {
  const navigate = useNavigate();
  const plan = buildPlan();
  const total = plan.reduce((s, p) => s + p.minutes, 0);
  const totalXp = plan.reduce((s, p) => s + p.xp, 0);

  if (plan.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/90">Today's plan</p>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-foreground tracking-tight mt-1">
            {plan.length} short bursts · ~{total} min
          </h2>
          <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
            <Trophy className="h-3 w-3 text-warning" />
            Earn <span className="text-foreground font-semibold">{totalXp} XP</span> if you finish all of them
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => navigate(`/focus-sprint?classId=${plan[0].classId}&duration=${plan[0].minutes}`)}
          className="rounded-full h-9 px-4 bg-gradient-calm border-0 text-primary-foreground hover:opacity-95"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Start first burst
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
              className={cn(
                "w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors group glass",
                p.highYield
                  ? "border-warning/30 hover:border-warning/60"
                  : "border-border/40 hover:border-border/80",
              )}
            >
              <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
              <span className={cn("h-2 w-2 rounded-full flex-shrink-0", p.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                  <span className="text-muted-foreground">{p.className.split(" ").slice(0, 2).join(" ")}</span>
                  <span>· {p.task}</span>
                  {p.highYield && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-warning">
                      <Flame className="h-3 w-3" /> High-yield
                    </span>
                  )}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                {p.minutes}m
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-warning/90 ml-1">
                +{p.xp} XP
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
