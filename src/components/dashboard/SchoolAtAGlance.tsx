/**
 * School at a glance — the stable layer on Today.
 *
 * Deliberately compact: it is not a second navigation bar, just a
 * persistent, truthful summary of upcoming work with real destinations.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardList, GraduationCap } from "lucide-react";
import { describeWeek, type WeekGlance } from "@/lib/calendar/weekGlance";
import { cn } from "@/lib/utils";

export function SchoolAtAGlance({ glance, loading = false }: { glance: WeekGlance; loading?: boolean }) {
  if (loading) {
    return <div role="status" aria-label="Loading school at a glance" className="h-[76px] animate-pulse rounded-2xl bg-muted/40" />;
  }

  return (
    <section
      aria-label="School at a glance"
      className="rounded-2xl border border-border/50 bg-card/65 p-3 shadow-sm backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          School at a glance
        </p>
        {glance.overdue > 0 && (
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {glance.overdue} overdue
          </Link>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <GlanceCard label="This week" text={describeWeek(glance.thisWeek)} counts={glance.thisWeek} />
        <GlanceCard label="Next week" text={describeWeek(glance.nextWeek)} counts={glance.nextWeek} />
      </div>

      <div className="mt-2 flex gap-2">
        <GlanceLink to="/assignments" icon={ClipboardList} label="Assignments" />
        <GlanceLink to="/exams" icon={GraduationCap} label="Tests & exams" />
      </div>
    </section>
  );
}

function GlanceCard({ label, text, counts }: { label: string; text: string; counts: { assignments: number; tests: number } }) {
  const empty = counts.assignments === 0 && counts.tests === 0;
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border/40 bg-background/40 px-3 py-2",
        empty && "opacity-70",
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-medium text-foreground">{text}</p>
    </div>
  );
}

function GlanceLink({ to, icon: Icon, label }: { to: string; icon: typeof ClipboardList; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/40 bg-background/30 px-2 text-[11px] font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
