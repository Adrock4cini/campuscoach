import { useId, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trickCardLabel, type TrickMatch } from "@/lib/study/verifiedTricks";

const TONE: Record<string, string> = {
  verified: "border-primary/30 bg-primary/5",
  conditional: "border-amber-500/25 bg-amber-500/5",
  study_strategy: "border-border/60 bg-muted/40",
};

export interface VerifiedTrickCardProps {
  match: TrickMatch;
  /** Shown when the student wants a generated alternative instead. */
  onTryAnother?: () => void;
  className?: string;
}

/**
 * Displays a curated trick from the library. This card never implies the trick
 * is universal: the tier badge, the conditions, and the caveats are part of the
 * card itself, not hidden behind a tooltip.
 */
export function VerifiedTrickCard({ match, onTryAnother, className }: VerifiedTrickCardProps) {
  const { trick, workedExample } = match;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const detailsId = useId();
  const label = trickCardLabel(trick);

  return (
    <div
      data-testid="verified-trick-card"
      data-trick-id={trick.id}
      className={`min-w-0 space-y-3 rounded-2xl border p-4 ${TONE[trick.tier] ?? TONE.conditional} ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {trick.tier === "verified"
          ? <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          : <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">· {trick.technique}</span>
      </div>

      <div className="space-y-1.5">
        <p className="break-words font-display text-base leading-snug text-foreground">{trick.title}</p>
        <p className="break-words text-sm font-medium leading-relaxed text-foreground">{trick.trick}</p>
      </div>

      <p className="break-words rounded-xl border border-border/50 bg-background/70 p-3 text-sm leading-relaxed text-foreground">
        {workedExample ?? trick.examples[0]}
      </p>

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          When it applies
        </p>
        <p className="break-words text-xs leading-relaxed text-muted-foreground">{trick.conditions}</p>
      </div>

      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
      >
        Why it works{trick.caveats.length > 0 ? " · watch out for" : ""}
        {detailsOpen
          ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {detailsOpen && (
        <div id={detailsId} className="space-y-2">
          <p className="break-words text-sm leading-relaxed text-foreground">{trick.why}</p>
          {trick.caveats.length > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {trick.caveats.map((caveat) => (
                <li key={caveat} className="break-words text-xs leading-relaxed text-muted-foreground">
                  {caveat}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {trick.transferCheck && (
        <div className="space-y-2 rounded-xl border border-border/50 bg-background/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Try it yourself
          </p>
          <p className="break-words text-sm leading-relaxed text-foreground">{trick.transferCheck.prompt}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setCheckOpen((open) => !open)}>
            {checkOpen ? "Hide answer" : "Check answer"}
          </Button>
          {checkOpen && (
            <p role="status" aria-live="polite" className="break-words text-sm font-medium text-foreground">
              {trick.transferCheck.answer}
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Reading a trick doesn’t change mastery — the practice you do next does.
      </p>

      {onTryAnother && (
        <Button type="button" variant="ghost" size="sm" onClick={onTryAnother} className="min-h-11 text-muted-foreground">
          Show me a different approach
        </Button>
      )}
    </div>
  );
}
