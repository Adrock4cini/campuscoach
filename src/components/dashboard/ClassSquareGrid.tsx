/**
 * Your classes — the main glanceable grid at the top of Today.
 *
 * Compact, square-ish, widget-like cards: 2 across on phones, 3 on wider
 * screens. Each card shows at most two honest alerts, with a status dot for
 * urgency instead of a wall of badges. Tapping opens that Class Command
 * Center. Readiness only ever appears as words already produced upstream.
 */
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import type { ClassAlert } from "@/lib/dashboard/classAlerts";
import { sidebarClassLabel } from "@/lib/app/sidebarClassLabel";
import { cn } from "@/lib/utils";

const dotTone: Record<ClassAlert["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  calm: "bg-muted-foreground/40",
};

const textTone: Record<ClassAlert["tone"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
};

export function ClassSquareGrid({
  classes,
  alerts = {},
  loading = false,
}: {
  classes: ClassInfo[];
  alerts?: Record<string, ClassAlert>;
  loading?: boolean;
}) {
  return (
    <section aria-labelledby="dashboard-classes-title" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2
          id="dashboard-classes-title"
          className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
        >
          Your classes
        </h2>
        {classes.length > 0 && (
          <Link to="/classes" className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline">
            All {classes.length}
          </Link>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Loading your classes" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[1/0.92] animate-pulse rounded-3xl bg-muted/40" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-background/30 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No classes yet</p>
          <Link to="/classes/new" className="mt-1 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            Add your first class
          </Link>
        </div>
      ) : (
        <ul aria-label="Class summaries" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {classes.map((classInfo) => {
            const alert = alerts[classInfo.id];
            const primary = alert?.text ?? "Nothing urgent";
            const tone = alert?.tone ?? "calm";
            return (
              <li key={classInfo.id}>
                <Link
                  to={`/classes/${encodeURIComponent(classInfo.id)}`}
                  aria-label={`Open ${classInfo.name}. ${primary}${alert?.secondary ? `. ${alert.secondary}` : ""}`}
                  className="flex h-full min-h-[124px] flex-col justify-between rounded-3xl border border-border/50 bg-card/65 p-3.5 shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10"
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-semibold text-primary-foreground",
                        classInfo.color,
                      )}
                      aria-hidden
                    >
                      {classInfo.name.trim().charAt(0)}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate pt-1 font-display text-sm font-semibold leading-tight text-foreground"
                      title={classInfo.name}
                    >
                      {sidebarClassLabel({ name: classInfo.name, courseCode: classInfo.courseCode })}
                    </span>
                  </span>

                  <span className="mt-3 block space-y-1">
                    <span className="flex items-start gap-1.5">
                      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", dotTone[tone])} aria-hidden />
                      <span className={cn("block text-[11px] font-medium leading-snug", textTone[tone])}>{primary}</span>
                    </span>
                    {alert?.secondary && (
                      <span className="block truncate pl-3 text-[10px] text-muted-foreground">{alert.secondary}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              to="/classes/new"
              className="flex h-full min-h-[124px] flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-border/60 bg-background/20 p-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add class
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}
