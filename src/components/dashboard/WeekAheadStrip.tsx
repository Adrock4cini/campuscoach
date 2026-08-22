/**
 * Week ahead strip — the stable orientation anchor on Today.
 *
 * Two compact rows (This week / Next week) that expand into the real items
 * behind the count. Orientation before study: a student should be able to
 * answer "what's coming?" without opening anything.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, ClipboardList, GraduationCap } from "lucide-react";
import type { WeekAhead, WeekAheadRow } from "@/lib/dashboard/weekAhead";
import { describeWeekAhead } from "@/lib/dashboard/weekAhead";
import { cn } from "@/lib/utils";

interface Props {
  weekAhead: WeekAhead;
  meetings: { thisWeek: number; nextWeek: number };
  loading?: boolean;
}

export function WeekAheadStrip({ weekAhead, meetings, loading = false }: Props) {
  const [open, setOpen] = useState<"this" | "next" | null>(null);

  if (loading) {
    return <div role="status" aria-label="Loading your week" className="h-[88px] animate-pulse rounded-2xl bg-muted/40" />;
  }

  return (
    <section
      aria-label="Your week"
      className="overflow-hidden rounded-2xl border border-border/50 bg-card/65 shadow-sm backdrop-blur-md"
    >
      <WeekRow
        label="This week"
        summary={describeWeekAhead(weekAhead.thisWeek, meetings.thisWeek)}
        rows={weekAhead.thisWeek}
        expanded={open === "this"}
        onToggle={() => setOpen(open === "this" ? null : "this")}
      />
      <WeekRow
        label="Next week"
        summary={describeWeekAhead(weekAhead.nextWeek, meetings.nextWeek)}
        rows={weekAhead.nextWeek}
        expanded={open === "next"}
        onToggle={() => setOpen(open === "next" ? null : "next")}
      />
    </section>
  );
}

function WeekRow({
  label, summary, rows, expanded, onToggle,
}: {
  label: string;
  summary: string;
  rows: WeekAheadRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const empty = rows.length === 0;
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={empty}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors enabled:hover:bg-primary/5 disabled:cursor-default"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
          <span className="block truncate text-xs font-medium text-foreground">{summary}</span>
        </span>
        {!empty && (
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        )}
      </button>

      {expanded && !empty && (
        <ul className="border-t border-border/40 bg-background/30 px-2 py-1.5">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                to={row.kind === "exam" ? "/exams" : "/assignments"}
                className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-primary/5"
              >
                {row.kind === "exam"
                  ? <GraduationCap className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  : <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  <span className="text-muted-foreground">{row.className} · </span>{row.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{row.when}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
