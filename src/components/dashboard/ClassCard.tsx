import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, AlertTriangle, Clock, CheckCircle2, Users,
  BookOpen, Mic, Camera, FileText, ListChecks, Sparkles, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  classes, exams, assignments, getDaysUntil, getReadinessColor, type ClassInfo,
} from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { cn } from "@/lib/utils";

type Status = { tone: "high" | "medium" | "low"; label: string; Icon: typeof AlertTriangle };

function deriveStatus(c: ClassInfo, examDays: number | null, assignDays: number | null): Status {
  if (examDays !== null && examDays <= 7 && c.readiness < 60)
    return { tone: "high", label: "Needs attention", Icon: AlertTriangle };
  if (assignDays !== null && assignDays <= 2)
    return { tone: "medium", label: "Due soon", Icon: Clock };
  if (c.readiness >= 70) return { tone: "low", label: "On track", Icon: CheckCircle2 };
  return { tone: "medium", label: "Keep building", Icon: Clock };
}

const toneStyles = {
  high:   { bar: "bg-danger",  ring: "ring-danger/30",  text: "text-danger",  glow: "shadow-[0_0_40px_-20px_hsl(var(--danger)/0.6)]" },
  medium: { bar: "bg-warning", ring: "ring-warning/30", text: "text-warning", glow: "shadow-[0_0_40px_-20px_hsl(var(--warning)/0.5)]" },
  low:    { bar: "bg-success", ring: "ring-success/25", text: "text-success", glow: "shadow-[0_0_40px_-22px_hsl(var(--success)/0.45)]" },
};

interface Props { classId: string; index?: number; }

export function ClassCard({ classId, index = 0 }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const c = classes.find((k) => k.id === classId);
  if (!c) return null;

  const exam = exams
    .filter((e) => e.classId === c.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const nextAssign = assignments
    .filter((a) => a.classId === c.id && a.status !== "turned-in")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const pulse = getClassPulse(c.id);

  const examDays = exam ? getDaysUntil(exam.date) : null;
  const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : null;
  const status = deriveStatus(c, examDays, assignDays);
  const tone = toneStyles[status.tone];

  const focusTopic = pulse?.mostStruggled.topic ?? c.currentTopic;
  const pulseLine = pulse
    ? `${pulse.mostStruggled.studentCount} classmates focused on ${pulse.mostStruggled.topic}`
    : null;

  const formatDays = (d: number | null) =>
    d === null ? "—" : d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;

  // Quick actions — surfaced front-and-center
  const quickActions = [
    { label: "Study Now",     icon: Sparkles, primary: true,  to: `/focus-sprint?classId=${c.id}&duration=25` },
    { label: "Practice Quiz", icon: ListChecks,                to: `/study-lab?classId=${c.id}` },
    { label: "Record Class",  icon: Mic,                       to: `/notes?classId=${c.id}` },
    { label: "Scan Chapter",  icon: Camera,                    to: `/classes/${c.id}` },
  ];
  const moreActions = [
    { label: "Open Assignments", icon: ListChecks, to: `/assignments?classId=${c.id}` },
    { label: "Open Notes",       icon: FileText,   to: `/notes?classId=${c.id}` },
    { label: "Class home",       icon: BookOpen,   to: `/classes/${c.id}` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 glass shadow-card",
        "hover:border-border/80 transition-colors",
        tone.glow,
      )}
    >
      {/* Color accent rail */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", c.color)} />

      <div className="p-5 pl-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", c.color)} />
              {c.professor}
            </div>
            <h3 className="font-display text-lg md:text-xl font-semibold text-foreground truncate mt-1">
              {c.name}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn("rounded-full border-border/40 text-[11px] gap-1", tone.text)}
          >
            <status.Icon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>

        {/* Readiness bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Readiness</span>
            <span className={cn("font-semibold", getReadinessColor(c.readiness))}>{c.readiness}%</span>
          </div>
          <Progress value={c.readiness} className="h-1.5" />
        </div>

        {/* Compact stats grid */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Next exam"   value={formatDays(examDays)} muted={examDays === null} />
          <Stat label="Next due"    value={formatDays(assignDays)} muted={assignDays === null} />
          <Stat label="Focus"       value={focusTopic} truncate />
        </div>

        {/* Next-up line */}
        {(nextAssign || exam) && (
          <div className="mt-4 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5 text-xs">
            {nextAssign ? (
              <p className="text-foreground/85 truncate">
                <span className="text-muted-foreground">Next:</span>{" "}
                <span className="font-medium text-foreground">{nextAssign.title}</span>
              </p>
            ) : (
              <p className="text-foreground/85 truncate">
                <span className="text-muted-foreground">Exam:</span>{" "}
                <span className="font-medium text-foreground">{exam!.title}</span>
              </p>
            )}
            {pulseLine && (
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" /> {pulseLine}
              </p>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {quickActions.map((a) => (
            <Button
              key={a.label}
              size="sm"
              variant={a.primary ? "default" : "outline"}
              onClick={() => navigate(a.to)}
              className={cn(
                "h-8 rounded-full text-xs gap-1.5",
                a.primary && "bg-gradient-calm border-0 text-primary-foreground hover:opacity-95",
              )}
            >
              <a.icon className="h-3.5 w-3.5" />
              {a.label}
            </Button>
          ))}
          <button
            onClick={() => setOpen((v) => !v)}
            className="h-8 px-2 rounded-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            More
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        {/* Expanded */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                {pulse && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <Insight label="🔥 Most tested" value={pulse.mostStarred.topic} />
                    <Insight label="⚠️ Most missed" value={pulse.mostStruggled.topic} />
                    <Insight label="📈 Trending"   value={pulse.trending.topic} />
                    <Insight label="👥 Class"      value={pulse.classComparison} />
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {moreActions.map((a) => (
                    <Button
                      key={a.label}
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(a.to)}
                      className="h-8 rounded-full text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <a.icon className="h-3.5 w-3.5" />
                      {a.label}
                      <ArrowRight className="h-3 w-3 opacity-60" />
                    </Button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, muted, truncate }: { label: string; value: string; muted?: boolean; truncate?: boolean }) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/20 px-2.5 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "text-xs font-medium mt-0.5",
        muted ? "text-muted-foreground/70" : "text-foreground",
        truncate && "truncate",
      )}>
        {value}
      </p>
    </div>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/20 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs text-foreground mt-0.5 line-clamp-2">{value}</p>
    </div>
  );
}
