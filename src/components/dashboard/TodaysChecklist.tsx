import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Check, Circle, Sparkles } from "lucide-react";
import {
  generateTodayPlan,
  refreshTodayPlanAfterAction,
  type TodayPlan,
  type TodayPlanItem,
} from "@/lib/intelligence/todayPlanEngine";
import { cn } from "@/lib/utils";

/**
 * Today's Plan as a stripped-down checklist:
 *   ✔ task           15m
 * Nothing else. Campus Brain recalculates on completion.
 */
export function TodaysChecklist() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TodayPlan>(() => generateTodayPlan());
  const [checking, setChecking] = useState<string | null>(null);
  const [burst, setBurst] = useState<{ id: string; gain: number } | null>(null);

  const refresh = useCallback(() => setPlan(generateTodayPlan()), []);
  useEffect(() => {
    const events = ["intelligence:updated", "capture:committed", "today-plan:updated"];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [refresh]);

  const handleRow = (item: TodayPlanItem) => {
    navigate(item.primaryAction.to);
  };

  const handleCheck = (e: React.MouseEvent, item: TodayPlanItem) => {
    e.stopPropagation();
    setChecking(item.id);
    setBurst({ id: item.id, gain: item.expectedReadinessGain });
    setTimeout(() => {
      const next = refreshTodayPlanAfterAction(item.id);
      setPlan(next);
      setChecking(null);
    }, 260);
    setTimeout(() => setBurst(null), 1100);
  };

  if (plan.items.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-foreground/80">Today's plan</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {plan.items.length} left · {plan.totalMinutes}m
        </span>
      </div>

      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {plan.items.map((it) => {
            const isChecking = checking === it.id;
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: isChecking ? 0.4 : 1, y: 0 }}
                exit={{ opacity: 0, x: -8, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  role="button"
                  onClick={() => handleRow(it)}
                  className="group relative flex items-center gap-3 rounded-xl border border-border/30 hover:border-border/70 bg-background/30 backdrop-blur px-3 py-2.5 cursor-pointer transition-colors"
                >
                  <button
                    onClick={(e) => handleCheck(e, it)}
                    aria-label="Mark complete"
                    className={cn(
                      "h-6 w-6 rounded-full border flex items-center justify-center shrink-0 transition-all",
                      isChecking
                        ? "bg-success border-success text-white scale-110"
                        : "border-border/60 hover:border-primary hover:bg-primary/10 text-transparent hover:text-primary",
                    )}
                  >
                    {isChecking ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                  </button>
                  <span className={cn("h-2 w-2 rounded-full shrink-0", it.classColor)} />
                  <p className={cn(
                    "flex-1 min-w-0 text-sm truncate transition-all",
                    isChecking ? "text-muted-foreground line-through" : "text-foreground",
                  )}>
                    {it.title}
                  </p>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {it.minutes}m
                  </span>

                  <AnimatePresence>
                    {burst?.id === it.id && (
                      <motion.span
                        initial={{ opacity: 0, y: 0, scale: 0.9 }}
                        animate={{ opacity: 1, y: -22, scale: 1 }}
                        exit={{ opacity: 0, y: -32 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="pointer-events-none absolute right-3 top-1 inline-flex items-center gap-1 text-[11px] font-semibold text-success"
                      >
                        <Sparkles className="h-3 w-3" />
                        +{burst.gain} readiness
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
