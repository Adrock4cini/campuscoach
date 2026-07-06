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
import { ClassBrainAggregateStrip } from "@/components/intelligence/ClassBrainAggregateStrip";
import { InviteClassmatesButton } from "@/components/invite/InviteClassmatesButton";
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 glass shadow-card",
        "hover:border-primary/30 transition-colors",
        tone.glow,
      )}
    >
      {/* Color accent rail */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", c.color)} />
      {/* Aurora wash */}
      <div aria-hidden className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />
      <div aria-hidden className="absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-accent/10 blur-[90px] pointer-events-none" />

      <div className="relative p-6 pl-7 md:p-7 md:pl-8">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", c.color)} />
              {c.professor}
            </div>
            <h3 className="font-display text-2xl md:text-[26px] font-semibold text-foreground truncate mt-1.5 leading-tight">
              {c.name}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <Badge variant="outline" className={cn("rounded-full border-border/40 text-[11px] gap-1 px-2.5 py-1", tone.text)}>
              <status.Icon className="h-3 w-3" />
              {status.label}
            </Badge>
            {pulse && (
              <Badge
                variant="outline"
                className="rounded-full text-[10px] gap-1 badge-high-yield border-0 breathing-glow"
                title="High-yield — most likely on the next test"
              >
                <Sparkles className="h-3 w-3" />
                High-yield
              </Badge>
            )}
          </div>
        </div>

        {/* Big glowing readiness ring */}
        <div className="mt-6 flex items-center gap-5">
          <PredictedScoreRing value={c.readiness} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Predicted Test Score</p>
            <p className={cn("font-display text-3xl font-semibold mt-1", getReadinessColor(c.readiness))}>
              {c.readiness}%
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
              Focus: <span className="text-foreground/85">{focusTopic}</span>
            </p>
          </div>
        </div>

        {/* Compact stats grid */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Stat label="Next exam" value={formatDays(examDays)} muted={examDays === null} />
          <Stat label="Next due"  value={formatDays(assignDays)} muted={assignDays === null} />
        </div>

        {/* Next-up line */}
        {(nextAssign || exam) && (
          <div className="mt-4 rounded-2xl border border-border/40 bg-background/30 px-4 py-3 text-xs">
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
              <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" /> {pulseLine}
              </p>
            )}
          </div>
        )}

        {/* Aggregate Campus Brain strip — anonymous, thresholded */}
        <ClassBrainAggregateStrip classId={c.id} className="mt-3" limit={2} />


        {/* Chunky action buttons — 2x2 grid */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.to)}
              className={cn(
                "h-12 rounded-2xl text-sm font-medium inline-flex items-center justify-center gap-2 transition-all",
                a.primary
                  ? "btn-glow"
                  : "border border-border/50 bg-background/40 backdrop-blur text-foreground hover:border-primary/40 hover:bg-background/60",
              )}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 w-full h-9 rounded-xl text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
        >
          {open ? "Less" : "More insights"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>

        {/* Expanded */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-4 border-t border-border/30 space-y-3">
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
                      className="h-9 rounded-full text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <a.icon className="h-3.5 w-3.5" />
                      {a.label}
                      <ArrowRight className="h-3 w-3 opacity-60" />
                    </Button>
                  ))}
                </div>
                <InviteClassmatesButton classId={c.id} className={c.name} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Big glowing readiness ring — the emotional centerpiece of each class card. */
function PredictedScoreRing({ value }: { value: number }) {
  const size = 92;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-0 rounded-full bg-gradient-calm opacity-30 blur-2xl breathing-glow" />
      <svg width={size} height={size} className="relative -rotate-90">
        <defs>
          <linearGradient id="cc-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(169 100% 55%)" />
            <stop offset="60%" stopColor="hsl(195 95% 65%)" />
            <stop offset="100%" stopColor="hsl(290 95% 70%)" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" opacity={0.5} />
        <motion.circle
          cx={size/2} cy={size/2} r={r}
          stroke="url(#cc-ring)" strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: dash }}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-lg font-semibold text-foreground">{value}</span>
      </div>
    </div>
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
