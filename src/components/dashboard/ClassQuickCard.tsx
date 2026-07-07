import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Mic, Camera, BookOpen, StickyNote, Lightbulb, Sparkles,
  CalendarClock, ClipboardList, ChevronDown, Zap,
} from "lucide-react";
import { classes, exams, assignments, getDaysUntil, type ClassInfo } from "@/data/demo";
import { getClassLearningSnapshot } from "@/lib/intelligence/learningEngine";
import { cn } from "@/lib/utils";

interface Props {
  classId: string;
  index?: number;
}

/**
 * Compact intelligent class card. Answers, at a glance:
 *   • class name + readiness
 *   • next exam/assignment
 *   • one Campus Brain recommendation
 *   • Continue → primary route
 *
 * Expand → the fastest way into the class: Record, Scan Whiteboard,
 * Scan Textbook, Notes, Ask Brain.
 */
export function ClassQuickCard({ classId, index = 0 }: Props) {
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
  const examDays = exam ? getDaysUntil(exam.date) : null;
  const assignDays = nextAssign ? getDaysUntil(nextAssign.dueDate) : null;

  const snapshot = getClassLearningSnapshot(c.id);
  const rec = snapshot?.recommendation;

  const nextLine =
    assignDays !== null && (examDays === null || assignDays <= examDays)
      ? {
          Icon: ClipboardList,
          label: nextAssign!.title,
          meta: assignDays <= 0 ? "Due today" : assignDays === 1 ? "1d" : `${assignDays}d`,
        }
      : examDays !== null
      ? {
          Icon: CalendarClock,
          label: exam!.title,
          meta: examDays <= 0 ? "Today" : `${examDays}d`,
        }
      : null;

  const tone =
    c.readiness < 60 ? "stroke-[hsl(var(--danger))]" :
    c.readiness < 75 ? "stroke-[hsl(var(--warning))]" :
                       "stroke-[hsl(var(--success))]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-border/40 hover:border-border/70 glass transition-colors"
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", c.color)} />

      <div className="relative p-4 pl-5">
        <div className="flex items-center gap-3">
          <MiniRing value={c.readiness} toneClass={tone} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-foreground truncate leading-tight">
              {c.name}
            </h3>
            {nextLine && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <nextLine.Icon className="h-3 w-3" />
                <span className="truncate">{nextLine.label}</span>
                <span className="tabular-nums opacity-80">· {nextLine.meta}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(rec?.route ?? `/classes/${c.id}`)}
            className="btn-glow h-9 px-3.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 shrink-0"
          >
            Continue
            <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="h-9 w-9 rounded-xl border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        {rec && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs text-foreground/90 truncate flex-1">{rec.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{rec.estimatedMinutes}m</span>
          </div>
        )}

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-5 gap-2">
                <Action Icon={Mic}      label="Record"    onClick={() => navigate(`/notes?classId=${c.id}&action=record`)} />
                <Action Icon={Camera}   label="Whiteboard" onClick={() => navigate(`/classes/${c.id}?action=scan-whiteboard`)} />
                <Action Icon={BookOpen} label="Textbook"  onClick={() => navigate(`/classes/${c.id}?action=scan-textbook`)} />
                <Action Icon={FileText} label="Notes"     onClick={() => navigate(`/notes?classId=${c.id}`)} />
                <Action Icon={Sparkles} label="Ask Brain" onClick={() => navigate(`/study-lab?classId=${c.id}`)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function MiniRing({ value, toneClass }: { value: number; toneClass: string }) {
  const size = 40, stroke = 4;
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
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-[10px] font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

function Action({ Icon, label, onClick }: { Icon: typeof Mic; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-border/40 bg-background/30 py-2 px-1 text-[10px] font-medium text-foreground/80 hover:border-primary/40 hover:text-foreground transition-colors"
    >
      <Icon className="h-4 w-4" />
      <span className="truncate w-full text-center">{label}</span>
    </button>
  );
}
