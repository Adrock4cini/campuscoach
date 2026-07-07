import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Play, Zap, Timer, TrendingUp, Sparkles, ShieldCheck } from "lucide-react";
import { classes, getReadinessColor } from "@/data/demo";
import {
  buildLearningState,
  type ClassLearningSnapshot,
  type LearningRecommendation,
  type ActivityKind,
} from "@/lib/intelligence/learningEngine";
import { cn } from "@/lib/utils";

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

        {/* Single CTA */}
        <button
          onClick={() => navigate(rec.route)}
          className="mt-6 w-full md:w-auto h-14 md:min-w-[240px] px-8 rounded-2xl bg-gradient-calm text-primary-foreground text-base font-semibold inline-flex items-center justify-center gap-2 shadow-elegant hover:opacity-95 transition-opacity"
        >
          <Play className="h-5 w-5" />
          Start now
        </button>
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
