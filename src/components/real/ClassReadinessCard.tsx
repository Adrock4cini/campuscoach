/**
 * ClassReadinessCard — readiness that explains itself.
 *
 * Tapping the score reveals the plain-language evidence behind it. When
 * there is too little evidence we show "Still learning" / "Not enough
 * info yet" instead of a falsely precise percentage.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClassReadinessSignals } from "@/lib/intelligence/useClassReadinessSignals";
import type { ReadinessTone } from "@/lib/intelligence/readinessExplanation";

interface Props {
  classId: string;
  daysToExam?: number | null;
  overdueAssignments?: number;
}

const toneText: Record<ReadinessTone, string> = {
  good: "text-success",
  watch: "text-warning",
  gap: "text-danger",
};

export function ClassReadinessCard({ classId, daysToExam, overdueAssignments }: Props) {
  const [open, setOpen] = useState(false);
  const { explanation, signals, loading } = useClassReadinessSignals(classId, { daysToExam, overdueAssignments });
  const scored = explanation.status === "scored" && explanation.percent !== null;

  return (
    <Card className="shadow-card">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center gap-3 p-5 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">How ready you are</p>
            <p className="mt-0.5 font-display text-lg font-semibold text-foreground">
              {loading ? "Checking your evidence…" : explanation.label}
            </p>
            {!loading && (
              <>
                <p className="mt-1 text-sm text-muted-foreground">{explanation.headline}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {`Based on ${signals.attempts} practice question${signals.attempts === 1 ? "" : "s"} · `}
                  {`${signals.conceptCount} concept${signals.conceptCount === 1 ? "" : "s"} from `}
                  {`${signals.captureCount} class material${signals.captureCount === 1 ? "" : "s"}`}
                </p>
              </>
            )}
          </div>
          {scored && (
            <span className="shrink-0 font-display text-2xl font-bold tabular-nums text-foreground">
              {explanation.percent}%
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {scored && (
          <div className="px-5 pb-4">
            <Progress value={explanation.percent ?? 0} className="h-2" />
          </div>
        )}

        {open && (
          <div className="space-y-3 border-t border-border/40 px-5 py-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" /> What this is based on
            </p>
            <ul className="space-y-2">
              {explanation.factors.map((factor) => (
                <li key={factor.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{factor.label}</span>
                  <span className={cn("text-right font-medium", toneText[factor.tone])}>{factor.detail}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-primary/5 p-3 text-sm text-foreground">{explanation.nextStep}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
