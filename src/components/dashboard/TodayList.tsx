/**
 * Today — at most three things that actually need action right now.
 * Everything else stays one tap away in the calendar/list views.
 */
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, FileText, GraduationCap } from "lucide-react";
import { DUE_BUCKET_LABEL, type UrgentItem } from "@/lib/dashboard/urgentItems";
import { cn } from "@/lib/utils";

const TONE: Record<UrgentItem["tone"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
};

export const TODAY_MAX_ITEMS = 3;

export function TodayList({
  items,
  loading = false,
  onOpenItem,
}: {
  items: UrgentItem[];
  loading?: boolean;
  onOpenItem?: (item: UrgentItem) => void;
}) {
  const visible = items.slice(0, TODAY_MAX_ITEMS);
  const remaining = Math.max(0, items.length - visible.length);

  return (
    <section aria-labelledby="dashboard-today-title" className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="dashboard-today-title" className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Today
        </h2>
        <Link to="/calendar" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          View full calendar
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading today" className="h-[92px] animate-pulse rounded-2xl bg-muted/40" />
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-card/65 px-3.5 py-3 text-xs text-muted-foreground shadow-sm backdrop-blur-md">
          Nothing is due or overdue today. Good place to get ahead.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border/50 bg-card/65 shadow-sm backdrop-blur-md">
          {visible.map((item) => {
            const Icon = item.kind === "exam" ? GraduationCap : FileText;
            return (
              <li key={`${item.kind}-${item.id}`} className="border-b border-border/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpenItem?.(item)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-primary/5 active:bg-primary/10"
                >
                  <Icon className={cn("h-4 w-4 shrink-0", TONE[item.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {/* Status is always the canonical due bucket, never words
                          the student happened to type into the title. */}
                      <span className={cn("font-medium", TONE[item.tone])}>{DUE_BUCKET_LABEL[item.bucket]}</span>
                      {" · "}{item.className} · <span className={TONE[item.tone]}>{item.when}</span>
                      {item.stale && " · still open"}
                    </span>
                  </span>

                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {remaining > 0 && (
        <Link to="/assignments" className="inline-flex min-h-11 items-center px-1 text-xs font-medium text-primary hover:underline">
          +{remaining} more · view all
        </Link>
      )}
    </section>
  );
}
