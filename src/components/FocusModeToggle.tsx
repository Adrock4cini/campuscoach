import { Leaf, Zap } from "lucide-react";
import { useFocusMode } from "@/contexts/FocusModeContext";
import { cn } from "@/lib/utils";

/**
 * Tiny segmented toggle for Calm ↔ Hyperfocus modes.
 * Lives in the app header so it is always one tap away.
 */
export function FocusModeToggle() {
  const { mode, setMode } = useFocusMode();

  return (
    <div
      role="tablist"
      aria-label="Focus mode"
      className="hidden sm:inline-flex items-center rounded-full border border-border/50 bg-background/40 backdrop-blur p-0.5 text-[11px]"
    >
      <button
        role="tab"
        aria-selected={mode === "calm"}
        onClick={() => setMode("calm")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors",
          mode === "calm"
            ? "bg-primary/15 text-primary shadow-[0_0_18px_-8px_hsl(var(--primary)/0.6)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Leaf className="h-3 w-3" /> Calm
      </button>
      <button
        role="tab"
        aria-selected={mode === "hyperfocus"}
        onClick={() => setMode("hyperfocus")}
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors",
          mode === "hyperfocus"
            ? "bg-accent/20 text-accent-foreground shadow-[0_0_18px_-8px_hsl(var(--accent)/0.5)]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Zap className="h-3 w-3" /> Hyperfocus
      </button>
    </div>
  );
}
