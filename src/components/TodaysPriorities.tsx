import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classes, exams, assignments, getDaysUntil, getReadinessColor, type ClassInfo } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { cn } from "@/lib/utils";

type Priority = {
  c: ClassInfo;
  urgency: "high" | "medium" | "low";
  title: string;
  meta: string;
  expanded: { label: string; value: string }[];
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
    let title = c.name;
    let meta = "On track";

    if (exam && examDays !== null && examDays <= 7 && c.readiness < 60) {
      urgency = "high";
      title = c.name;
      meta = `Exam in ${examDays}d`;
    } else if (assignDays !== null && assignDays <= 2) {
      urgency = "medium";
      title = c.name;
      meta = assignDays <= 0 ? "Due today" : assignDays === 1 ? "Due tomorrow" : `Due in ${assignDays}d`;
    } else if (c.readiness >= 70) {
      urgency = "low";
      meta = "Ready";
    } else {
      urgency = "medium";
      meta = "Keep building";
    }

    const expanded: Priority["expanded"] = [];
    if (pulse?.mostStruggled) expanded.push({ label: "Most missed", value: pulse.mostStruggled.topic });
    if (pulse?.trending) expanded.push({ label: "Trending", value: pulse.trending.topic });
    if (c.currentTopic) expanded.push({ label: "Current topic", value: c.currentTopic });
    if (pulse?.classComparison) expanded.push({ label: "Class", value: pulse.classComparison });

    const actions: Priority["actions"] = [];
    if (urgency === "high") {
      actions.push({ label: "Study now", to: `/focus-sprint?classId=${c.id}&duration=25`, primary: true });
      actions.push({ label: "Quiz", to: `/study-lab?classId=${c.id}` });
    } else if (urgency === "medium") {
      actions.push({ label: nextAssign ? "Open" : "Class", to: nextAssign ? `/assignments/${nextAssign.id}` : `/classes/${c.id}`, primary: true });
    } else {
      actions.push({ label: "Open", to: `/classes/${c.id}`, primary: true });
    }

    return { c, urgency, title, meta, expanded, actions };
  }).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });
}

const urgencyStyles = {
  high: { bar: "bg-danger", icon: AlertTriangle, iconColor: "text-danger", label: "Focus" },
  medium: { bar: "bg-warning", icon: Clock, iconColor: "text-warning", label: "Soon" },
  low: { bar: "bg-success", icon: CheckCircle2, iconColor: "text-success", label: "OK" },
};

export function TodaysPriorities() {
  const navigate = useNavigate();
  const priorities = buildPriorities();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1.5">
          <Sparkles className="h-3 w-3" />
          Today
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">
          Your priorities
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {priorities.map((p, i) => {
          const s = urgencyStyles[p.urgency];
          const isOpen = openId === p.c.id;
          return (
            <motion.div
              key={p.c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="relative overflow-hidden rounded-2xl border border-border/40 glass"
            >
              <div className={cn("absolute left-0 top-0 bottom-0 w-0.5", s.bar)} />
              <button
                className="w-full text-left p-4 flex items-center gap-3"
                onClick={() => setOpenId(isOpen ? null : p.c.id)}
              >
                <div className={cn("h-2 w-2 rounded-full flex-shrink-0", p.c.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground truncate">{p.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.meta}</p>
                </div>
                <Badge variant="outline" className={cn("text-xs border-border/40", getReadinessColor(p.c.readiness))}>
                  {p.c.readiness}%
                </Badge>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
                      {p.expanded.length > 0 && (
                        <dl className="space-y-1.5">
                          {p.expanded.map((e) => (
                            <div key={e.label} className="flex items-start justify-between gap-3 text-xs">
                              <dt className="text-muted-foreground">{e.label}</dt>
                              <dd className="text-foreground/90 text-right">{e.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {p.actions.map((a) => (
                          <Button
                            key={a.label}
                            size="sm"
                            variant={a.primary ? "default" : "outline"}
                            className={cn(
                              "h-8 rounded-full text-xs",
                              a.primary && "bg-gradient-calm border-0 text-primary-foreground hover:opacity-95"
                            )}
                            onClick={(ev) => { ev.stopPropagation(); navigate(a.to); }}
                          >
                            {a.label}
                            {a.primary && <ArrowRight className="h-3 w-3 ml-1" />}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <div className="text-center">
        <Link to="/classes" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          All classes →
        </Link>
      </div>
    </section>
  );
}
