/**
 * Quick actions — only shipped, working capture entry points.
 * Nothing that is still "coming next" appears here as an active action.
 * The persistent global Capture button is the primary capture entry point, so
 * the generic "Capture" tile is intentionally omitted here.
 */
import { ScanLine, Lightbulb, StickyNote } from "lucide-react";
import type { CaptureKind } from "@/lib/capture/types";

const ACTIONS: { kind: CaptureKind | undefined; label: string; Icon: typeof ScanLine }[] = [
  { kind: "scan-assignment", label: "Scan homework", Icon: ScanLine },
  { kind: "professor-hint", label: "Teacher hint", Icon: Lightbulb },
  { kind: "quick-note", label: "Quick note", Icon: StickyNote },
];

export function QuickActionsRow({ onAction }: { onAction: (kind?: CaptureKind) => void }) {
  return (
    <section aria-label="Quick actions" className="space-y-2.5">
      <h2 className="px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Quick actions</h2>
      <div className="grid grid-cols-3 gap-2.5">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onAction(action.kind)}
            className="flex min-h-[64px] flex-col items-start justify-center gap-1.5 rounded-2xl border border-border/50 bg-card/65 px-3.5 py-3 text-left shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10"
          >
            <action.Icon className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

