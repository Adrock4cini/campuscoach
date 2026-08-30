/**
 * Next up — one compact cross-class strip, not a second dashboard module.
 *
 * Two rows at most: the next test and the next thing due. Each row is a
 * drill-in to the real list view. Readiness is always a word, never a bare
 * percentage, and we never invent counts we don't have.
 */
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardList, GraduationCap } from "lucide-react";
import type { NextUpSummary } from "@/lib/dashboard/classAlerts";
import { READINESS_MEANING } from "@/lib/intelligence/testReadinessLabel";
import { cn } from "@/lib/utils";

export function NextUpStrip({ summary, loading = false }: { summary: NextUpSummary; loading?: boolean }) {
  if (loading) {
    return <div role="status" aria-label="Loading next up" className="h-[92px] animate-pulse rounded-2xl bg-muted/40" />;
  }

  const { nextTest, nextDue } = summary;
  if (!nextTest && !nextDue) {
    return (
      <section
        aria-label="Next up"
        className="rounded-2xl border border-border/50 bg-card/65 px-3.5 py-3 text-xs text-muted-foreground shadow-sm backdrop-blur-md"
      >
        Nothing scheduled yet. Add a test or assignment and it shows up here.
      </section>
    );
  }

  return (
    <section aria-label="Next up" className="overflow-hidden rounded-2xl border border-border/50 bg-card/65 shadow-sm backdrop-blur-md">
      {nextTest && (
        <Row
          to="/exams"
          icon={GraduationCap}
          label="Next test"
          title={`${nextTest.className} · ${nextTest.when}`}
          detail={nextTest.insufficient ? "Need material" : nextTest.readinessLabel}
          detailTitle={READINESS_MEANING}
          more={nextTest.count > 1 ? `${nextTest.count} tests coming up` : undefined}
        />
      )}
      {nextDue && (
        <Row
          to={`/assignments/${encodeURIComponent(nextDue.assignmentId)}`}
          icon={ClipboardList}
          label="Next due"
          title={`${nextDue.className} · ${nextDue.when}`}
          detail={nextDue.title}
          danger={nextDue.overdue}
          more={nextDue.count > 1 ? `${nextDue.count} due this week` : undefined}
        />
      )}
    </section>
  );
}

function Row({
  to, icon: Icon, label, title, detail, detailTitle, more, danger,
}: {
  to: string;
  icon: typeof ClipboardList;
  label: string;
  title: string;
  detail: string;
  detailTitle?: string;
  more?: string;
  danger?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center gap-3 border-b border-border/40 px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-primary/5 active:bg-primary/10"
    >
      <Icon className={cn("h-4 w-4 shrink-0", danger ? "text-danger" : "text-primary")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <span className={cn("block truncate text-xs font-medium", danger ? "text-danger" : "text-foreground")}>
          {title}
          <span className="font-normal text-muted-foreground" title={detailTitle}> · {detail}</span>
        </span>
        {more && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{more}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
