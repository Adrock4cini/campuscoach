import { motion } from "framer-motion";
import { BookOpen, ClipboardList, Brain, Clock, Hand } from "lucide-react";
import { classes, exams, assignments, getDaysUntil, studentName } from "@/data/demo";
import { useCoachBrief } from "@/lib/intelligence";

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function MorningBrief() {
  const greeting = timeOfDayGreeting();
  const classCount = classes.length;

  // Status + recommended minutes come from the central Intelligence
  // Engine so the dashboard stays in sync with every other surface.
  const brief = useCoachBrief();

  const assignmentsDueThisWeek = assignments.filter(
    (a) => a.status !== "turned-in" && getDaysUntil(a.dueDate) <= 7,
  ).length;

  const soonestExam = [...exams]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const examDays = soonestExam ? getDaysUntil(soonestExam.date) : null;

  const stats = [
    { icon: BookOpen, label: `${classCount} class${classCount === 1 ? "" : "es"}`, tone: "primary" as const },
    { icon: ClipboardList, label: `${assignmentsDueThisWeek} assignment${assignmentsDueThisWeek === 1 ? "" : "s"} due this week`, tone: "warning" as const },
    ...(examDays !== null && examDays >= 0
      ? [{ icon: Brain, label: `1 exam in ${examDays} day${examDays === 1 ? "" : "s"}`, tone: "danger" as const }]
      : []),
    { icon: Clock, label: `AI recommends ${brief.recommendedMinutesToday} min today`, tone: "accent" as const },
  ];


  const toneBorder: Record<string, string> = {
    primary: "border-primary/25",
    warning: "border-warning/25",
    danger: "border-danger/25",
    accent: "border-accent/25",
  };
  const toneBg: Record<string, string> = {
    primary: "bg-primary/10",
    warning: "bg-warning/10",
    danger: "bg-danger/10",
    accent: "bg-accent/10",
  };
  const toneText: Record<string, string> = {
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent",
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl border border-border/50 glass shadow-elegant"
    >
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-primary/15 blur-[90px]" />
        <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-accent/15 blur-[80px]" />
      </div>

      <div className="relative p-5 md:p-6 flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl md:text-2xl font-semibold text-foreground truncate">
            {greeting}, {studentName} <span className="ml-0.5">👋</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border backdrop-blur text-[11px] font-medium ${toneBorder[s.tone]} ${toneBg[s.tone]} ${toneText[s.tone]}`}
            >
              <s.icon className="h-3 w-3" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hand className="h-3.5 w-3.5 text-primary" />
          <span>{status}</span>
        </div>
      </div>
    </motion.section>
  );
}
