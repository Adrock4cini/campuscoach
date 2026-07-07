import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Play, Zap, Timer, TrendingUp, Sparkles, ShieldCheck, ChevronDown, CheckCircle2,
  Camera, ClipboardList, CalendarClock, BookOpen, Gauge, Flame, Users, GraduationCap, FileText,
} from "lucide-react";
import { classes, getReadinessColor } from "@/data/demo";
import {
  buildLearningState,
  type ClassLearningSnapshot,
  type LearningRecommendation,
  type ActivityKind,
  type EvidenceSource,
} from "@/lib/intelligence/learningEngine";
import { cn } from "@/lib/utils";

const EVIDENCE_ICON: Record<EvidenceSource, typeof Camera> = {
  capture: Camera,
  assignment: ClipboardList,
  exam: CalendarClock,
  "study-session": BookOpen,
  readiness: Gauge,
  momentum: Flame,
  "class-signal": Users,
  "professor-emphasis": GraduationCap,
  "peer-signal": Users,
  syllabus: FileText,
};

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  flashcards: "Flashcards",
  "multiple-choice": "Practice Quiz",
  "timed-challenge": "Timed Challenge",
  "focus-sprint": "Focus Sprint",
  "review-notes": "Review Notes",
  "review-capture": "Review Capture",
  "start-assignment": "Assignment",
  "finish-assignment": "Finish Assignment",
  "exam-simulation": "Exam Simulation",
  "concept-refresh": "Concept Refresh",
};

interface State {
  rec: LearningRecommendation;
  snapshot: ClassLearningSnapshot;
}

/**
 * The single most important surface in the app.
 * Answers "what should I do RIGHT NOW?" in under 2 seconds.
 */
export function DoThisNowHero() {
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      try {
        const ls = buildLearningState();
        const rec = ls.recommendations[0];
        const snap = ls.classes.find((s) => s.classId === rec.classId);
        if (rec && snap) setState({ rec, snapshot: snap });
      } catch { /* keep last */ }
    };
    refresh();
    const events = ["intelligence:updated", "capture:committed", "today-plan:updated"];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, []);

  if (!state) return null;
  const { rec, snapshot } = state;
  const c = classes.find((k) => k.id === rec.classId);
  const color = c?.color ?? "bg-primary";
  const activity = ACTIVITY_LABEL[rec.activity];
  const confidence = Math.round(rec.confidence * 100);
  const readinessAfter = Math.min(100, snapshot.readiness + rec.estimatedLearningGain);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-[28px] border border-primary/30 glass shadow-elegant"
    >
      {/* Aurora */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-16 h-[380px] w-[380px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -bottom-24 -right-16 h-[380px] w-[380px] rounded-full bg-accent/25 blur-[130px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/0 via-background/20 to-background/50" />
      </div>

      <div className="relative p-6 md:p-8">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-primary/90 mb-3">
          <Zap className="h-3.5 w-3.5" />
          Do this now
        </div>

        <div className="flex items-start gap-4">
          <div className={cn("h-11 w-11 rounded-2xl flex items-center justify-center shrink-0", color)}>
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl md:text-4xl font-semibold leading-tight tracking-tight text-foreground">
              {rec.label}
            </h2>
            <p className="mt-1.5 text-sm md:text-base text-foreground/70 truncate">
              {snapshot.className} · {activity}
            </p>
          </div>
        </div>

        {/* Metrics row */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric
            Icon={Timer}
            label="Time"
            value={`${rec.estimatedMinutes}m`}
            tone="text-primary"
          />
          <Metric
            Icon={TrendingUp}
            label="Impact"
            value={`+${rec.estimatedLearningGain}`}
            sub={`→ ${readinessAfter}%`}
            tone="text-success"
          />
          <Metric
            Icon={ShieldCheck}
            label="Confidence"
            value={`${confidence}%`}
            tone="text-accent"
          />
          <Metric
            Icon={Sparkles}
            label="Readiness"
            value={`${snapshot.readiness}%`}
            sub={snapshot.estimatedGrade}
            tone={getReadinessColor(snapshot.readiness)}
          />
        </div>

        {/* One-sentence rationale */}
        {rec.rationale && (
          <p className="mt-5 text-sm text-foreground/75 leading-relaxed">
            {rec.rationale}
          </p>
        )}

        {/* Single CTA + Why */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate(rec.route)}
            className="h-14 md:min-w-[240px] px-8 rounded-2xl bg-gradient-calm text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2 shadow-elegant hover:opacity-95 transition-opacity flex-1 md:flex-initial"
          >
            <Play className="h-5 w-5" />
            Start now
          </button>
          <button
            onClick={() => setWhyOpen((v) => !v)}
            className="h-11 px-4 rounded-xl border border-border/50 bg-background/40 backdrop-blur text-xs font-medium text-foreground/80 hover:text-foreground hover:border-border inline-flex items-center gap-1.5 transition-colors"
            aria-expanded={whyOpen}
          >
            Why?
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", whyOpen && "rotate-180")} />
          </button>
        </div>

        <AnimatePresence>
          {whyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-2xl border border-border/40 bg-background/30 backdrop-blur p-4">
                {/* Confidence bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-accent" />
                    Confidence
                  </div>
                  <span className="text-xs font-semibold text-foreground tabular-nums">{confidence}%</span>
                </div>
                <div className="h-1 rounded-full bg-border/40 overflow-hidden mb-4">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${confidence}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full bg-gradient-calm rounded-full"
                  />
                </div>

                {/* Evidence bullets */}
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Evidence · {rec.evidence.length}
                </p>
                <ul className="space-y-1.5 mb-4">
                  {rec.evidence.slice(0, 4).map((ev, i) => {
                    const Icon = EVIDENCE_ICON[ev.source] ?? Sparkles;
                    return (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/85">
                        <span className="mt-0.5 h-5 w-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Icon className="h-3 w-3 text-primary" />
                        </span>
                        <span className="flex-1 leading-snug">{ev.note}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 mt-0.5">
                          {Math.round(ev.strength * 100)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Verification */}
                <div className="flex items-start gap-2 pt-3 border-t border-border/30">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Verify after
                    </p>
                    <p className="text-xs text-foreground/85 mt-0.5 leading-snug">
                      {rec.verification.note}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function Metric({
  Icon, label, value, sub, tone,
}: {
  Icon: typeof Timer;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/30 backdrop-blur px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className={cn("h-3 w-3", tone)} />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("font-display text-xl font-semibold", tone)}>{value}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}
