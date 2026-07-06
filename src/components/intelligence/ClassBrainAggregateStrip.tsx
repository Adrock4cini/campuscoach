/**
 * Class Brain Aggregate Strip
 *
 * Compact, privacy-safe summary of what the Campus Brain has learned
 * from ANONYMOUS aggregate signals for a class. Never renders raw
 * captures, transcripts, or exam questions — only thresholded counts,
 * percentages, and topic labels from `aggregateSignals`.
 */

import { Badge } from "@/components/ui/badge";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import {
  useAggregateInsightsForClass,
  CONFIDENCE_LABEL,
  type ConfidenceBand,
} from "@/lib/intelligence/aggregateSignals";
import { cn } from "@/lib/utils";

interface Props {
  classId: string;
  className?: string;
  /** Cap how many insight chips are rendered. */
  limit?: number;
}

const bandStyles: Record<ConfidenceBand, string> = {
  low: "border-muted-foreground/30 text-muted-foreground",
  growing: "border-primary/40 text-primary",
  strong: "border-success/50 text-success",
};

export function ClassBrainAggregateStrip({
  classId,
  className,
  limit = 3,
}: Props) {
  const { insights, loading, hasEnoughData, topConfidence } =
    useAggregateInsightsForClass(classId);

  if (loading) return null;

  if (!hasEnoughData) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2",
          className
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary/70" />
        Campus Brain is still learning this class.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 font-medium flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" /> Class Brain — aggregate
        </p>
        <Badge
          variant="outline"
          className={cn("text-[10px] gap-1", bandStyles[topConfidence])}
        >
          {CONFIDENCE_LABEL[topConfidence]}
        </Badge>
      </div>
      <ul className="space-y-1">
        {insights.slice(0, limit).map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-2 text-xs text-foreground/90"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70 flex-shrink-0" />
            <span className="truncate">{i.headline}</span>
            {i.metric && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                <Users className="h-2.5 w-2.5" /> {i.metric}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
