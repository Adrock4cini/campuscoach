/**
 * Your classes — a compact horizontal rail instead of a full-page list.
 *
 * Each card shows the class and its single most important honest signal.
 * Readiness only ever appears as a word (inside the alert text), never as a
 * bare unexplained percentage.
 */
import { Link } from "react-router-dom";
import type { ClassInfo } from "@/data/demo";
import type { ClassAlert } from "@/lib/dashboard/classAlerts";
import { sidebarClassLabel } from "@/lib/app/sidebarClassLabel";
import { cn } from "@/lib/utils";

const alertTone: Record<ClassAlert["tone"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
};

export function ClassRail({
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
        <h2 id="dashboard-classes-title" className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Your classes
        </h2>
        {classes.length > 0 && (
          <Link to="/classes" className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline">
            See all {classes.length} classes
          </Link>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Loading your classes" className="h-[120px] animate-pulse rounded-2xl bg-muted/40" />
      ) : classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">No classes yet</p>
          <Link to="/classes/new" className="mt-1 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            Add your first class
          </Link>
        </div>
      ) : (
        <ul
          aria-label="Class summaries"
          className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {classes.map((classInfo) => {
            const alert = alerts[classInfo.id];
            const signal = alert?.text ?? "Nothing urgent";
            return (
              <li key={classInfo.id} className="w-[28%] min-w-[92px] max-w-[110px] shrink-0 snap-start sm:w-[120px]">
                <Link
                  to={`/classes/${encodeURIComponent(classInfo.id)}`}
                  aria-label={`Open ${classInfo.name}. ${signal}`}
                  className="flex h-full min-h-[96px] flex-col justify-between rounded-2xl border border-border/50 bg-card/65 p-2.5 shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-display text-xs font-semibold text-primary-foreground",
                        classInfo.color,
                      )}
                      aria-hidden
                    >
                      {classInfo.name.trim().charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold text-foreground" title={classInfo.name}>
                      {sidebarClassLabel({ name: classInfo.name, courseCode: classInfo.courseCode })}
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <span className={cn("block text-[10px] font-medium leading-tight", alert ? alertTone[alert.tone] : "text-muted-foreground")}>
                      {signal}
                    </span>
                    {alert?.secondary && (
                      <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{alert.secondary}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

