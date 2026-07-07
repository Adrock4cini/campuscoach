import { motion } from "framer-motion";
import { Flame, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { useMomentum } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

/**
 * Habit-reinforcement footer. Streak · Momentum · Weekly trend · Small win.
 * Kept low-visual-weight so it never competes with the hero.
 */
export function BottomBar() {
  const m = useMomentum();
  const TrendIcon =
    m.trend === "rising" ? TrendingUp :
    m.trend === "cooling" ? TrendingDown : Minus;
  const trendTone =
    m.trend === "rising" ? "text-success" :
    m.trend === "cooling" ? "text-warning" : "text-muted-foreground";
  const celebration =
    m.streak >= 7 ? "🔥 Week-long streak" :
    m.streak >= 3 ? "✨ Streak building" :
    m.score >= 55 ? "👏 Steady wins" :
                    "💪 Start small today";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded-2xl border border-border/40 bg-background/30 backdrop-blur px-4 py-3"
    >
      <Stat Icon={Flame}     tone="text-warning" label="Streak"   value={`${m.streak}d`} />
      <Stat Icon={Sparkles}  tone="text-primary" label="Momentum" value={`${m.score}`} />
      <Stat Icon={TrendIcon} tone={trendTone}    label="Trend"    value={m.trend} />
      <div className="hidden md:flex items-center justify-end text-xs text-foreground/70">
        {celebration}
      </div>
      <div className="col-span-2 md:hidden text-xs text-foreground/70 text-center">
        {celebration}
      </div>
    </motion.div>
  );
}

function Stat({
  Icon, label, value, tone,
}: { Icon: typeof Flame; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} />
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground leading-none">{label}</div>
        <div className={cn("text-sm font-semibold tabular-nums capitalize leading-tight", tone)}>{value}</div>
      </div>
    </div>
  );
}
