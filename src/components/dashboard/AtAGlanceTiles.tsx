/**
 * At a glance — four compact, tappable counts. The student's school
 * situation, answered in one scan. Counts only; no predictions.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CalendarDays, GraduationCap } from "lucide-react";
import type { GlanceCounts } from "@/lib/dashboard/glanceCounts";
import { TESTS_COMING_DAYS } from "@/lib/dashboard/glanceCounts";
import { cn } from "@/lib/utils";

type Tone = "danger" | "warning" | "calm" | "primary";

const toneClass: Record<Tone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
  primary: "text-primary",
};

export function AtAGlanceTiles({ counts, loading = false }: { counts: GlanceCounts; loading?: boolean }) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading your school situation" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
    );
  }

  const tiles: { label: string; value: number; to: string; tone: Tone; Icon: typeof AlertTriangle; hint: string }[] = [
    {
      label: "Overdue",
      value: counts.overdue,
      to: "/assignments?filter=overdue",
      tone: counts.overdue > 0 ? "danger" : "calm",
      Icon: AlertTriangle,
      hint: "Past due and not finished",
    },
    {
      label: "Due today",
      value: counts.dueToday,
      to: "/assignments?filter=today",
      tone: counts.dueToday > 0 ? "warning" : "calm",
      Icon: CalendarClock,
      hint: "Due before the day ends",
    },
    {
      label: "Upcoming",
      value: counts.upcoming,
      to: "/calendar",
      tone: "primary",
      Icon: CalendarDays,
      hint: "Due in the next 7 days",
    },
    {
      label: "Tests coming",
      value: counts.testsComing,
      to: "/exams",
      tone: counts.testsComing > 0 ? "primary" : "calm",
      Icon: GraduationCap,
      hint: `Next ${TESTS_COMING_DAYS} days`,
    },
  ];

  return (
    <section aria-label="At a glance" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          to={tile.to}
          aria-label={`${tile.label}: ${tile.value}. ${tile.hint}`}
          className="flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/50 bg-card/65 px-3.5 py-3 shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10"
        >
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <tile.Icon className={cn("h-3.5 w-3.5", toneClass[tile.tone])} aria-hidden />
            {tile.label}
          </span>
          <span className={cn("font-display text-2xl font-semibold tabular-nums leading-none", toneClass[tile.tone])}>
            {tile.value}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">{tile.hint}</span>
        </Link>
      ))}
    </section>
  );
}
