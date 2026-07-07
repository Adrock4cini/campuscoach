import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Timer,
  Sparkles,
  Flame,
  BookOpen,
  ClipboardList,
  Zap,
  Camera,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateTodayPlan,
  refreshTodayPlanAfterAction,
  type TodayPlan,
  type TodayPlanItem,
  type TodayPlanSource,
} from "@/lib/intelligence/todayPlanEngine";
import {
  buildLearningState,
  type LearningRecommendation,
} from "@/lib/intelligence/learningEngine";
import { RecommendationChips } from "@/components/intelligence/RecommendationChips";

const SOURCE_ICON: Record<TodayPlanSource, typeof Zap> = {
  exam: Zap,
  assignment: ClipboardList,
  "weak-concept": BookOpen,
  capture: Camera,
  momentum: TrendingUp,
};

const SOURCE_TONE: Record<TodayPlanSource, string> = {
  exam: "text-warning",
  assignment: "text-destructive",
  "weak-concept": "text-primary",
  capture: "text-accent",
  momentum: "text-success",
};

/**
 * Today's Plan — the dynamic, action-first list Campus Brain builds
 * from exams, assignments, weak classes, recent captures, and
 * momentum. Presentation only — all logic lives in
 * `src/lib/intelligence/todayPlanEngine.ts`.
 */
export function TodaysPlan() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TodayPlan>(() => generateTodayPlan());
  const [engineByClass, setEngineByClass] = useState<Map<string, LearningRecommendation>>(
    () => new Map(),
  );
  const [topRecId, setTopRecId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPlan(generateTodayPlan());
    try {
      const state = buildLearningState();
      const map = new Map<string, LearningRecommendation>();
      state.classes.forEach((s) => map.set(s.classId, s.recommendation));
      setEngineByClass(map);
      setTopRecId(state.recommendations[0]?.id ?? null);
    } catch {
      /* engine failure — keep plan-only rendering */
    }
  }, []);

  useEffect(() => {
    refresh();
    const events = [
      "intelligence:updated",
      "capture:committed",
      "today-plan:updated",
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [refresh]);

  const handleStart = (item: TodayPlanItem) => {
    // Optimistic: mark done immediately, then navigate.
    const next = refreshTodayPlanAfterAction(item.id);
    setPlan(next);
    navigate(item.primaryAction.to);
  };

  if (plan.items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/90">
            Today's plan
          </p>
          <h2 className="text-lg md:text-xl font-display font-semibold text-foreground tracking-tight mt-0.5">
            {plan.items.length} things · {plan.totalMinutes} min
          </h2>
        </div>
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary/80" />
          +{plan.totalReadinessGain} readiness
        </div>
      </div>

      <ol className="space-y-2">
        <AnimatePresence initial={false}>
          {plan.items.map((it, i) => {
            const Icon = SOURCE_ICON[it.source];
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="flex items-center gap-3 rounded-xl border border-border/40 hover:border-border/80 px-3 py-2.5 glass transition-colors">
                  <span
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      it.classColor,
                    )}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {it.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="truncate max-w-[9rem]">
                        {it.className.split(" ").slice(0, 2).join(" ")}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/40",
                          SOURCE_TONE[it.source],
                        )}
                      >
                        <Flame className="h-2.5 w-2.5" />
                        {it.reasonChip}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-2.5 w-2.5" />
                        {it.minutes}m
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStart(it)}
                    className="h-8 px-3 rounded-lg bg-gradient-calm text-primary-foreground text-xs font-medium inline-flex items-center gap-1 shrink-0 hover:opacity-95"
                  >
                    Start
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}
