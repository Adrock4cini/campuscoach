/**
 * Compact chip row surfacing the Learning Engine's metadata for a
 * primary CTA: minutes, learning gain, verification, and an optional
 * "Highest impact" marker for the global top recommendation.
 *
 * Presentation only — no logic. Consumers pass in a
 * LearningRecommendation and (optionally) a flag saying it's the top.
 */

import { Timer, TrendingUp, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearningRecommendation } from "@/lib/intelligence/learningEngine";
import { getRecommendationChips } from "@/lib/intelligence/recommendationLabels";

interface Props {
  recommendation: LearningRecommendation;
  isTop?: boolean;
  className?: string;
  /** Hide the verification chip when space is really tight. */
  compact?: boolean;
}

export function RecommendationChips({
  recommendation,
  isTop = false,
  className,
  compact = false,
}: Props) {
  const chips = getRecommendationChips(recommendation, isTop);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap text-[10.5px] text-muted-foreground",
        className,
      )}
    >
      {chips.highestImpact && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-medium">
          <Sparkles className="h-2.5 w-2.5" /> Highest impact
        </span>
      )}
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border/40 bg-background/40">
        <Timer className="h-2.5 w-2.5" /> {chips.minutes}
      </span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-success/25 bg-success/5 text-success">
        <TrendingUp className="h-2.5 w-2.5" /> {chips.gain}
      </span>
      {!compact && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border/40 bg-background/40">
          <ShieldCheck className="h-2.5 w-2.5" /> {chips.verify}
        </span>
      )}
    </div>
  );
}
