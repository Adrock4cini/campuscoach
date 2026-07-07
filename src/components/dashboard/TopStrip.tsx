import { motion } from "framer-motion";
import { Flame, TrendingUp, TrendingDown, Minus, Search, Bell } from "lucide-react";
import { studentName } from "@/data/demo";
import { useMomentum } from "@/lib/intelligence";
import { useCommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

/**
 * Row 1 — compact top strip. ~76px.
 *   Greeting · Momentum · Weekly trend · Search · Notifications
 * Kept deliberately small so the "Do This Now" hero owns the fold.
 */
export function TopStrip() {
  const momentum = useMomentum();
  const { setOpen } = useCommandPalette();
  const TrendIcon =
    momentum.trend === "rising" ? TrendingUp :
    momentum.trend === "cooling" ? TrendingDown : Minus;
  const tone =
    momentum.score >= 70 ? "text-success" :
    momentum.score >= 45 ? "text-warning" : "text-danger";

  return (
    <motion.header
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 px-1 h-[76px]"
    >
      <div className="min-w-0">
        <h1 className="font-display text-lg md:text-xl font-semibold text-foreground leading-tight truncate">
          {greetingWord()}, {studentName}
        </h1>
        <p className="text-[11px] text-muted-foreground truncate">{momentum.line}</p>
      </div>

      <div className={cn("hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 backdrop-blur px-2.5 py-1 text-xs font-medium tabular-nums", tone)}>
        <Flame className="h-3.5 w-3.5" />
        {momentum.streak}
        <span className="mx-1 opacity-40">·</span>
        <TrendIcon className="h-3.5 w-3.5" />
        {momentum.score}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Search</span>
        </button>
        <button
          aria-label="Notifications"
          className="relative h-8 w-8 rounded-full border border-border/50 bg-background/40 backdrop-blur inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        >
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </button>
      </div>
    </motion.header>
  );
}
