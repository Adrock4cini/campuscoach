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
    { Icon: BookOpen,      label: `${classes.length} classes`,           tone: "primary" as const },
    { Icon: AlertTriangle, label: `${urgentExams} urgent exam${urgentExams === 1 ? "" : "s"}`, tone: "danger"  as const },
    { Icon: ClipboardList, label: `${dueThisWeek} due this week`,        tone: "warning" as const },
    { Icon: Timer,         label: `${recommended} min recommended`,      tone: "accent"  as const },
  ];

  const toneClass: Record<string, string> = {
    primary: "border-primary/30 bg-primary/10 text-primary shadow-[0_0_24px_-10px_hsl(var(--primary)/0.6)]",
    danger:  "border-danger/30 bg-danger/10 text-danger shadow-[0_0_24px_-10px_hsl(var(--danger)/0.6)]",
    warning: "border-warning/30 bg-warning/10 text-warning shadow-[0_0_24px_-10px_hsl(var(--warning)/0.6)]",
    accent:  "border-accent/30 bg-accent/10 text-accent shadow-[0_0_24px_-10px_hsl(var(--accent)/0.6)]",
  };

  const initial = (studentName?.[0] ?? "?").toUpperCase();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-border/50 glass shadow-elegant"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-16 h-[320px] w-[320px] rounded-full bg-primary/25 blur-[110px]" />
        <div className="absolute -bottom-20 -right-16 h-[300px] w-[300px] rounded-full bg-accent/25 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 h-[200px] w-[200px] rounded-full bg-[hsl(330_90%_60%)]/15 blur-[120px]" />
      </div>

      <div className="relative p-7 md:p-9 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {/* Glowing avatar */}
          <div className="relative">
            <div aria-hidden className="absolute inset-0 rounded-full bg-gradient-calm opacity-50 blur-xl breathing-glow" />
            <div className="relative h-14 w-14 rounded-full bg-gradient-calm avatar-glow flex items-center justify-center">
              <span className="font-display text-xl font-semibold text-primary-foreground">{initial}</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1">
              <Sparkles className="h-3 w-3" />
              Today's snapshot
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-foreground leading-tight">
              {timeOfDayGreeting()}, {studentName}.
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Here's what needs attention today.</p>
          </div>
        </div>

        {/* Glowing pills */}
        <div className="flex flex-wrap gap-2.5">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur text-xs font-medium ${toneClass[s.tone]}`}
            >
              <s.Icon className="h-3.5 w-3.5" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => navigate("/your-week")}
            className="rounded-2xl h-12 px-6 btn-glow border-0 text-base font-medium"
          >
            Start today's plan
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            onClick={() => navigate("/classes")}
            variant="outline"
            className="rounded-2xl h-12 px-6 border-border/60 bg-background/40 backdrop-blur text-base"
          >
            All classes
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
