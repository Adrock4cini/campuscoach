/**
 * Assignments · Tests · Calendar — three persistent square summary cards.
 *
 * Counts only, straight from the student's own rows. Each card taps through
 * to the existing list it summarises. Colour appears only when something is
 * actually overdue or due today.
 */
import { Link } from "react-router-dom";
import { CalendarDays, FileText, GraduationCap } from "lucide-react";
import type { GlanceCounts } from "@/lib/dashboard/glanceCounts";
import { TESTS_COMING_DAYS } from "@/lib/dashboard/glanceCounts";
import { cn } from "@/lib/utils";

export interface SummarySquaresProps {
  counts: GlanceCounts;
  loading?: boolean;
}

export function assignmentsSummaryLine(counts: GlanceCounts): { text: string; urgent: boolean } {
  if (counts.overdue > 0) {
    return { text: counts.overdue === 1 ? "1 overdue" : `${counts.overdue} overdue`, urgent: true };
  }
  if (counts.dueToday > 0) {
    return { text: counts.dueToday === 1 ? "1 due today" : `${counts.dueToday} due today`, urgent: true };
  }
  if (counts.upcoming > 0) {
    return { text: `${counts.upcoming} this week`, urgent: false };
  }
  return { text: "Nothing due", urgent: false };
}

export function testsSummaryLine(counts: GlanceCounts): { text: string; urgent: boolean } {
  if (counts.testsComing > 0) {
    return {
      text: counts.testsComing === 1 ? "1 coming up" : `${counts.testsComing} coming up`,
      urgent: false,
    };
  }
  return { text: `None in ${TESTS_COMING_DAYS} days`, urgent: false };
}

export function SummarySquares({ counts, loading = false }: SummarySquaresProps) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading your work" className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-3xl bg-muted/40" />
        ))}
      </div>
    );
  }

  const assignments = assignmentsSummaryLine(counts);
  const tests = testsSummaryLine(counts);
  const assignmentCount = counts.overdue + counts.dueToday + counts.upcoming;

  const cards = [
    {
      label: "Assignments",
      value: assignmentCount,
      line: assignments.text,
      urgent: assignments.urgent,
      to: counts.overdue > 0 ? "/assignments?filter=overdue" : "/assignments",
      Icon: FileText,
    },
    {
      label: "Tests",
      value: counts.testsComing,
      line: tests.text,
      urgent: tests.urgent,
      to: "/exams",
      Icon: GraduationCap,
    },
    {
      label: "Calendar",
      value: null as number | null,
      line: "Your week",
      urgent: false,
      to: "/calendar",
      Icon: CalendarDays,
    },
  ];

  return (
    <section aria-label="Assignments, tests and calendar" className="grid grid-cols-3 gap-2.5">
      {cards.map(({ label, value, line, urgent, to, Icon }) => (
        <Link
          key={label}
          to={to}
          aria-label={`${label}. ${line}`}
          className={cn(
            "flex min-h-[104px] flex-col justify-between rounded-3xl border bg-card/65 p-3.5 shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10",
            urgent ? "border-danger/40" : "border-border/50",
          )}
        >
          <Icon className={cn("h-4 w-4", urgent ? "text-danger" : "text-muted-foreground")} aria-hidden />
          <span className="block">
            {value !== null && (
              <span className="block font-display text-2xl font-semibold leading-none text-foreground">{value}</span>
            )}
            <span className="mt-1 block text-[11px] font-medium leading-tight text-foreground">{label}</span>
            <span className={cn("block text-[10px] leading-tight", urgent ? "text-danger" : "text-muted-foreground")}>
              {line}
            </span>
          </span>
        </Link>
      ))}
    </section>
  );
}
