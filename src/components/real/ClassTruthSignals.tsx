import { Loader2 } from "lucide-react";
import type { ClassTruth } from "@/lib/intelligence/classTruth";

interface Props {
  truth?: ClassTruth;
  loading: boolean;
  error: boolean;
}

export function ClassTruthSignals({ truth, loading, error }: Props) {
  if (loading) {
    return (
      <div className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl bg-background/35 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this class…
      </div>
    );
  }

  if (error || !truth) {
    return (
      <div className="mt-4 rounded-2xl bg-background/35 px-3 py-3 text-xs text-muted-foreground">
        Couldn’t check class progress right now.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-background/35 px-3 py-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Material</span>
          <span className="mt-0.5 block truncate font-medium text-foreground">{truth.materialLabel}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preparedness</span>
          <span className="mt-0.5 block truncate font-medium text-foreground">{truth.preparednessLabel}</span>
        </div>
      </div>
      <div className="border-t border-border/40 pt-2 text-xs font-medium text-primary">
        {truth.nextAction}
      </div>
    </div>
  );
}
