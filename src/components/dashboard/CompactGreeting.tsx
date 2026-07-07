import { motion } from "framer-motion";
import { Flame, TrendingUp, TrendingDown, Minus, Search } from "lucide-react";
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
 * Compact top strip: greeting + momentum + inline search.
 * Deliberately tiny — the hero below is the star.
 */
export function CompactGreeting() {
  const momentum = useMomentum();
  const { setOpen } = useCommandPalette();
  const TrendIcon =
    momentum.trend === "rising" ? TrendingUp :
    momentum.trend === "cooling" ? TrendingDown : Minus;
  const tone =
    momentum.score >= 70 ? "text-success" :
    momentum.score >= 45 ? "text-warning" : "text-danger";

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 px-1"
    >
      <h1 className="font-display text-base md:text-lg font-medium text-foreground/90 truncate">
        {greetingWord()}, {studentName}
      </h1>
      <div className={cn("inline-flex items-center gap-1 text-xs font-medium", tone)}>
        <TrendIcon className="h-3.5 w-3.5" />
        {momentum.score}
        <span className="inline-flex items-center gap-0.5 ml-1 opacity-80">
          <Flame className="h-3 w-3" />
          {momentum.streak}
        </span>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 backdrop-blur px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors md:hidden"
        aria-label="Search"
      >
        <Search className="h-3 w-3" />
        Search
      </button>
    </motion.div>
  );
}
