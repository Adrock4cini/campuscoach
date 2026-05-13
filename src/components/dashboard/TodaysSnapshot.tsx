import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, BookOpen, AlertTriangle, ClipboardList, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { classes, assignments, exams, getDaysUntil, studentName } from "@/data/demo";

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function TodaysSnapshot() {
  const navigate = useNavigate();

  const urgentExams = exams.filter((e) => getDaysUntil(e.date) <= 7).length;
  const dueThisWeek = assignments.filter(
    (a) => a.status !== "turned-in" && getDaysUntil(a.dueDate) <= 7,
  ).length;

  // Recommended minutes ≈ sum of focus minutes per class needing attention
  const recommended = classes.reduce((sum, c) => {
    if (c.readiness < 60) return sum + 15;
    if (c.readiness < 75) return sum + 10;
    return sum + 5;
  }, 0);

  const stats = [
    { Icon: BookOpen,       label: `${classes.length} classes active` },
    { Icon: AlertTriangle,  label: `${urgentExams} urgent exam${urgentExams === 1 ? "" : "s"}` },
    { Icon: ClipboardList,  label: `${dueThisWeek} due this week` },
    { Icon: Timer,          label: `${recommended} min recommended` },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl border border-border/50 glass shadow-elegant"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-16 h-[280px] w-[280px] rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute -bottom-20 -right-16 h-[260px] w-[260px] rounded-full bg-accent/20 blur-[110px]" />
      </div>

      <div className="relative p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1.5">
            <Sparkles className="h-3 w-3" />
            Today's snapshot
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-foreground">
            {timeOfDayGreeting()}, {studentName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what needs attention today.
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-xs text-foreground/80">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <s.Icon className="h-3.5 w-3.5 text-primary" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button
            onClick={() => navigate("/your-week")}
            className="rounded-full h-10 px-5 bg-gradient-calm border-0 text-primary-foreground shadow-elegant hover:opacity-95"
          >
            Start today's plan
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            onClick={() => navigate("/classes")}
            variant="outline"
            className="rounded-full h-10 px-5 border-border/60 bg-background/30 backdrop-blur"
          >
            All classes
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
