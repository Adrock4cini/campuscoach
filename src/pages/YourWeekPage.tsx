import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CalendarRange, AlertTriangle, TrendingDown, Sparkles, Flame, ArrowRight, Target,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  classes, assignments, exams, getDaysUntil, getReadinessColor,
} from "@/data/demo";

/**
 * "Your Week" — a forward-looking AI summary that synthesizes
 * deadlines, exams, weak areas and workload into clear priorities.
 */
export default function YourWeekPage() {
  const navigate = useNavigate();

  const weekAssignments = [...assignments]
    .filter((a) => a.status !== "turned-in" && getDaysUntil(a.dueDate) <= 7 && getDaysUntil(a.dueDate) >= 0)
    .sort((a, b) => getDaysUntil(a.dueDate) - getDaysUntil(b.dueDate));

  const weekExams = exams.filter((e) => getDaysUntil(e.date) <= 14);
  const lowestReadiness = [...classes].sort((a, b) => a.readiness - b.readiness)[0];
  const cognitiveLoad = weekAssignments.filter((a) => a.priority === "high").length + weekExams.length;
  const loadLabel = cognitiveLoad >= 4 ? "Heavy" : cognitiveLoad >= 2 ? "Balanced" : "Light";
  const loadColor = cognitiveLoad >= 4 ? "text-danger" : cognitiveLoad >= 2 ? "text-warning" : "text-success";

  const priorities = [
    weekExams.length > 0 && {
      icon: <AlertTriangle className="h-4 w-4 text-danger" />,
      title: `${weekExams[0].className}: ${weekExams[0].title}`,
      detail: `In ${getDaysUntil(weekExams[0].date)} days · readiness ${weekExams[0].readiness}%`,
      cta: "Open exam plan",
      action: () => navigate(`/exams/${weekExams[0].id}`),
    },
    lowestReadiness && {
      icon: <TrendingDown className="h-4 w-4 text-warning" />,
      title: `${lowestReadiness.name} needs attention`,
      detail: `Readiness dropped to ${lowestReadiness.readiness}% — most students struggle with ${lowestReadiness.currentTopic}.`,
      cta: "Start a sprint",
      action: () => navigate(`/focus-sprint?classId=${lowestReadiness.id}&duration=25`),
    },
    weekAssignments[0] && {
      icon: <Flame className="h-4 w-4 text-primary" />,
      title: weekAssignments[0].title,
      detail: `${weekAssignments[0].className} · due in ${getDaysUntil(weekAssignments[0].dueDate)} day(s)`,
      cta: "Open assignment",
      action: () => navigate(`/assignments/${weekAssignments[0].id}`),
    },
  ].filter(Boolean) as { icon: any; title: string; detail: string; cta: string; action: () => void }[];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 glass-strong noise-overlay p-6 md:p-10"
      >
        <div aria-hidden className="absolute -top-24 -left-24 h-[320px] w-[320px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="relative">
          <span className="text-[11px] uppercase tracking-[0.22em] text-primary/90 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> AI weekly briefing
          </span>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mt-2">Your Week</h1>
          <p className="mt-3 text-foreground/70 max-w-2xl">
            You have <strong className="text-foreground">{cognitiveLoad}</strong> high-cognitive-load deadlines this week.
            Cognitive load this week is <span className={`font-semibold ${loadColor}`}>{loadLabel}</span>.
          </p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
            <Stat label="Deadlines" value={`${weekAssignments.length}`} />
            <Stat label="Exams" value={`${weekExams.length}`} />
            <Stat label="At-risk class" value={lowestReadiness?.name.split(" ")[0] ?? "—"} />
            <Stat label="Workload" value={loadLabel} />
          </div>
        </div>
      </motion.section>

      {/* Priorities */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> This week's top priorities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {priorities.map((p, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-muted/40 flex items-center justify-center flex-shrink-0">
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.detail}</p>
              </div>
              <Button variant="outline" size="sm" onClick={p.action}>
                {p.cta} <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Class readiness snapshot */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" /> Class readiness snapshot
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`}>
              <Card className="shadow-card hover:shadow-elevated transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`h-2 w-2 rounded-full ${c.color}`} />
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                    <Badge variant="secondary" className={`ml-auto text-xs ${getReadinessColor(c.readiness)}`}>
                      {c.readiness}%
                    </Badge>
                  </div>
                  <Progress value={c.readiness} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    Focus: {c.currentTopic}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 backdrop-blur px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-display font-semibold text-foreground mt-0.5">{value}</div>
    </div>
  );
}
