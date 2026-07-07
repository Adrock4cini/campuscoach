import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, Play, Mic, Camera, Sparkles, FileText,
  CalendarClock, ClipboardList, Users, BookOpen, Zap,
} from "lucide-react";
import {
  classes, exams, assignments, getDaysUntil, getReadinessColor, type ClassInfo,
} from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";
import { useClassCampusBrainInsight } from "@/lib/intelligence";
import {
  getClassLearningSnapshot,
  getTopLearningRecommendation,
} from "@/lib/intelligence/learningEngine";
import { CampusBrainInsightCard } from "@/components/intelligence/CampusBrainCard";
import { RecommendationChips } from "@/components/intelligence/RecommendationChips";
import { cn } from "@/lib/utils";


interface Props { classId: string; index?: number; }

/**
 * Class Command Card — dense, glanceable, expandable.
 * Collapsed: everything a student needs in a 15-second glance.
 * Expanded: deeper insights & secondary actions.
 */
export function ClassCommandCard({ classId, index = 0 }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const c = classes.find((k) => k.id === classId) as ClassInfo | undefined;
  if (!c) return null;

  const exam = exams
    .filter((e) => e.classId === c.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const nextAssign = assignments
    .filter((a) => a.classId === c.id && a.status !== "turned-in")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const pulse = getClassPulse(c.id);
  const brainInsight = useClassCampusBrainInsight(c.id);


  const examDays = exam ? getDaysUntil(exam.date) : null;
  const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : null;

  // Readiness tone
  const tone =
    c.readiness < 60 ? "danger" :
    c.readiness < 75 ? "warning" : "success";
  const toneRing = {
    danger:  "stroke-[hsl(var(--danger))]",
    warning: "stroke-[hsl(var(--warning))]",
    success: "stroke-[hsl(var(--success))]",
  }[tone];
  const toneGlow = {
    danger:  "shadow-[0_0_40px_-20px_hsl(var(--danger)/0.7)]",
    warning: "shadow-[0_0_40px_-20px_hsl(var(--warning)/0.6)]",
    success: "shadow-[0_0_40px_-22px_hsl(var(--success)/0.5)]",
  }[tone];

  // Engine-driven primary action (falls back to pulse/current topic).
  const snapshot = getClassLearningSnapshot(c.id);
  const rec = snapshot?.recommendation;
  const topRec = (() => {
    try { return getTopLearningRecommendation(); } catch { return null; }
  })();
  const isTop = !!rec && !!topRec && rec.id === topRec.id;
  const aiAction = rec
    ? rec.label
    : pulse
      ? `Drill "${pulse.mostStruggled.topic}"`
      : `Review ${c.currentTopic}`;
  const primaryRoute = rec?.route ?? `/focus-sprint?classId=${c.id}&duration=25`;

  const dayLabel = (d: number | null) =>
    d === null ? "—" : d <= 0 ? "Today" : d === 1 ? "1d" : `${d}d`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 glass",
        toneGlow,
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", c.color)} />
      <div aria-hidden className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-[80px] pointer-events-none" />

      <div className="relative p-5 pl-6">
        {/* Header row — all essentials in one line */}
        <div className="flex items-center gap-4">
          <MiniRing value={c.readiness} toneClass={toneRing} />

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg md:text-xl font-semibold text-foreground truncate leading-tight">
              {c.name}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className={cn("font-medium", getReadinessColor(c.readiness))}>
                {c.readiness}%
              </span>
              {examDays !== null && (
                <span className="inline-flex items-center gap-1" title="Next exam">
                  <CalendarClock className="h-3 w-3" />
                  {dayLabel(examDays)}
                </span>
              )}
              {assignDays !== null && (
                <span className="inline-flex items-center gap-1" title="Next assignment">
                  <ClipboardList className="h-3 w-3" />
                  {dayLabel(assignDays)}
                </span>
              )}
              {pulse && (
                <span className="inline-flex items-center gap-1 text-warning" title="High-yield topic">
                  <Sparkles className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="h-9 w-9 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        {/* ONE primary action — the engine's next-best step for this class */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-2xl border border-primary/25 bg-primary/5 px-3.5 py-2.5 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-foreground truncate">{aiAction}</span>
          </div>
          <button
            onClick={() => navigate(primaryRoute)}
            className="btn-glow h-11 px-5 rounded-2xl text-sm font-medium inline-flex items-center gap-1.5 shrink-0"
          >
            <Play className="h-4 w-4" />
            Continue
          </button>
        </div>
        {rec && (
          <RecommendationChips
            recommendation={rec}
            isTop={isTop}
            className="mt-2"
          />
        )}

        {/* Level 2+: everything else lives behind the chevron */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {brainInsight && (
                <div className="mt-4">
                  <CampusBrainInsightCard insight={brainInsight} compact />
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">

                {nextAssign && (
                  <Detail
                    Icon={ClipboardList}
                    label="Next assignment"
                    value={nextAssign.title}
                    meta={dayLabel(assignDays)}
                    onClick={() => navigate(`/assignments/${nextAssign.id}`)}
                  />
                )}
                {exam && (
                  <Detail
                    Icon={CalendarClock}
                    label="Next exam"
                    value={exam.title}
                    meta={dayLabel(examDays)}
                    onClick={() => navigate(`/exams/${exam.id}`)}
                  />
                )}
                {pulse && (
                  <Detail
                    Icon={Users}
                    label="Campus pulse"
                    value={pulse.mostStruggled.topic}
                    meta={`${pulse.mostStruggled.studentCount} peers`}
                  />
                )}
                <Detail
                  Icon={BookOpen}
                  label="Current topic"
                  value={c.currentTopic}
                  onClick={() => navigate(`/classes/${c.id}`)}
                />
              </div>

              {/* Secondary tools — icons only, no primary emphasis */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <IconAction Icon={Mic}      label="Record"  onClick={() => navigate(`/notes?classId=${c.id}&action=record`)} />
                <IconAction Icon={Camera}   label="Scan"    onClick={() => navigate(`/classes/${c.id}?action=scan`)} />
                <IconAction Icon={Sparkles} label="Campus Brain"  onClick={() => navigate(`/study-lab?classId=${c.id}`)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <MiniLink Icon={FileText}      label="Notes"       onClick={() => navigate(`/notes?classId=${c.id}`)} />
                <MiniLink Icon={ClipboardList} label="Assignments" onClick={() => navigate(`/assignments?classId=${c.id}`)} />
                <MiniLink Icon={BookOpen}      label="Class home"  onClick={() => navigate(`/classes/${c.id}`)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}

/* ---------- helpers ---------- */

function MiniRing({ value, toneClass }: { value: number; toneClass: string }) {
  const size = 52, stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ - (Math.max(0, Math.min(100, value)) / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" opacity={0.4} />
        <motion.circle
          cx={size/2} cy={size/2} r={r}
          className={toneClass}
          strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: dash }}
          transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-xs font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

function IconAction({ Icon, label, onClick }: { Icon: typeof Mic; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-11 rounded-2xl border border-border/40 bg-background/30 backdrop-blur inline-flex items-center justify-center gap-1.5 text-xs font-medium text-foreground/85 hover:border-primary/40 hover:text-foreground transition-colors"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Detail({
  Icon, label, value, meta, onClick,
}: {
  Icon: typeof CalendarClock; label: string; value: string; meta?: string; onClick?: () => void;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/30 bg-background/20 px-3 py-2 flex items-center gap-2 text-left w-full",
        onClick && "hover:border-primary/40 transition-colors cursor-pointer",
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground truncate">{value}</p>
      </div>
      {meta && <span className="text-[10px] text-muted-foreground shrink-0">{meta}</span>}
    </Comp>
  );
}

function MiniLink({ Icon, label, onClick }: { Icon: typeof BookOpen; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-full border border-border/40 bg-background/30 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
