import { Loader2 } from "lucide-react";
import { useClassReadinessSignals } from "@/lib/intelligence/useClassReadinessSignals";

interface Props {
  classId: string;
}

export function ClassTruthSignals({ classId }: Props) {
  const { explanation, signals, loading, error } = useClassReadinessSignals(classId);

  if (loading) {
    return (
      <div className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl bg-background/35 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this class…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-2xl bg-background/35 px-3 py-3 text-xs text-muted-foreground">
        Couldn’t check class progress right now.
      </div>
    );
  }

  const hasMaterial = signals.captureCount > 0 || signals.conceptCount > 0;
  const materialLabel = !hasMaterial
    ? "Need material"
    : signals.captureCount >= 3 || signals.conceptCount >= 5
      ? "Good material"
      : "Some material";

  const preparednessLabel = signals.attempts === 0
    ? "Not practiced"
    : explanation.status === "scored" && explanation.percent !== null
      ? `${explanation.label} · ${explanation.percent}%`
      : explanation.label;

  const nextAction = !hasMaterial
    ? "Add material"
    : signals.attempts === 0
      ? "Start practice"
      : explanation.weakCount > 0
        ? "Practice weak spots"
        : "Quick review";

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-background/35 px-3 py-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Material</span>
          <span className="mt-0.5 block truncate font-medium text-foreground">{materialLabel}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preparedness</span>
          <span className="mt-0.5 block truncate font-medium text-foreground">{preparednessLabel}</span>
        </div>
      </div>
      <div className="border-t border-border/40 pt-2 text-xs font-medium text-primary">
        {nextAction}
      </div>
    </div>
  );
}
