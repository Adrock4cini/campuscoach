import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classes, exams, assignments, getDaysUntil, getReadinessColor, type ClassInfo } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { cn } from "@/lib/utils";

type Priority = {
  c: ClassInfo;
  urgency: "high" | "medium" | "low";
  headline: string;
  detail: string;
  actions: { label: string; to: string; primary?: boolean }[];
};

function buildPriorities(): Priority[] {
  return classes.map((c) => {
    const exam = exams
      .filter((e) => e.classId === c.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const nextAssign = assignments
      .filter((a) => a.classId === c.id && a.status !== "turned-in")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    const pulse = getClassPulse(c.id);
    const examDays = exam ? getDaysUntil(exam.date) : null;
    const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : null;

    let urgency: Priority["urgency"] = "low";
    let headline = `${c.name} — On track`;
    let detail = pulse?.classComparison ?? "You're keeping pace with your class.";

    if (exam && examDays !== null && examDays <= 7 && c.readiness < 60) {
      urgency = "high";
      headline = `${c.name} — ${exam.title} in ${examDays} day${examDays === 1 ? "" : "s"}`;
      detail = `Readiness ${c.readiness}% · Most missed: ${pulse?.mostStruggled.topic ?? c.currentTopic}`;
    } else if (assignDays !== null && assignDays <= 2) {
      urgency = "medium";
      headline = `${c.name} — ${nextAssign!.title} due ${assignDays <= 0 ? "today" : assignDays === 1 ? "tomorrow" : `in ${assignDays}d`}`;
      detail = `${nextAssign!.estimatedTime} · ${pulse?.trending.topic ? `Trending: ${pulse.trending.topic}` : "Tap to open"}`;
    } else if (c.readiness >= 70) {
      urgency = "low";
      headline = `${c.name} — Ready`;
      detail = pulse?.classComparison ?? `You're ahead — readiness ${c.readiness}%.`;
    } else {
      urgency = "medium";
      headline = `${c.name} — Keep building`;
      detail = `Readiness ${c.readiness}% · Focus on ${c.currentTopic}`;
    }

    const actions: Priority["actions"] = [];
    if (urgency === "high") {
      actions.push({ label: "Continue Studying", to: `/focus-sprint?classId=${c.id}&duration=25`, primary: true });
      actions.push({ label: "Practice Quiz", to: `/study-lab?classId=${c.id}` });
      actions.push({ label: "Shared Notes", to: `/notes` });
    } else if (urgency === "medium") {
      actions.push({ label: nextAssign ? "Open Assignment" : `Open ${c.name.split(" ")[0]}`, to: nextAssign ? `/assignments/${nextAssign.id}` : `/classes/${c.id}`, primary: true });
      actions.push({ label: "Class Home", to: `/classes/${c.id}` });
    } else {
      actions.push({ label: `Open ${c.name.split(" ")[0]}`, to: `/classes/${c.id}`, primary: true });
    }

    return { c, urgency, headline, detail, actions };
  }).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });
}

const urgencyStyles = {
  high: { ring: "ring-danger/40", bar: "bg-danger", icon: AlertTriangle, iconColor: "text-danger", label: "Needs attention" },
  medium: { ring: "ring-warning/40", bar: "bg-warning", icon: Clock, iconColor: "text-warning", label: "Coming up" },
  low: { ring: "ring-success/40", bar: "bg-success", icon: CheckCircle2, iconColor: "text-success", label: "On track" },
};

export function TodaysPriorities() {
  const navigate = useNavigate();
  const priorities = buildPriorities();

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1.5">
            <Sparkles className="h-3 w-3" />
            Today's Priorities
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">
            Your academic life, right now
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {priorities.map((p, i) => {
          const s = urgencyStyles[p.urgency];
          const Icon = s.icon;
          return (
            <motion.div
              key={p.c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className={cn(
                "relative overflow-hidden rounded-2xl border border-border/60 glass p-5 hover-lift",
                "ring-1", s.ring
              )}
            >
              <div className={cn("absolute left-0 top-0 bottom-0 w-1", s.bar)} />
              <div className="flex items-start gap-3">
                <div className={cn("h-2.5 w-2.5 rounded-full mt-2 flex-shrink-0", p.c.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-3.5 w-3.5", s.iconColor)} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                    <Badge variant="outline" className={cn("ml-auto text-xs", getReadinessColor(p.c.readiness))}>
                      {p.c.readiness}%
                    </Badge>
                  </div>
                  <h3 className="font-display text-base font-semibold text-foreground leading-tight">
                    {p.headline}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1.5">{p.detail}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {p.actions.map((a) => (
                      <Button
                        key={a.label}
                        size="sm"
                        variant={a.primary ? "default" : "outline"}
                        className={cn(
                          "h-8 rounded-full text-xs",
                          a.primary && "bg-gradient-calm border-0 text-primary-foreground hover:opacity-95"
                        )}
                        onClick={() => navigate(a.to)}
                      >
                        {a.label}
                        {a.primary && <ArrowRight className="h-3 w-3 ml-1" />}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="text-center">
        <Link to="/classes" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all classes →
        </Link>
      </div>
    </section>
  );
}
