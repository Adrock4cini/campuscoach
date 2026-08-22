/**
 * Urgent attention — the short "handle this" list.
 *
 * Every overdue row offers a way OUT: done, still working on it, or no longer
 * relevant. The real due date is never changed by any of these — "still
 * working on it" only records progress. Nothing nags forever: after two weeks
 * the row goes quiet and simply asks for a decision. Shame-free by construction.
 */

import { Link } from "react-router-dom";
import { AlertTriangle, Check, CircleSlash, ClipboardList, GraduationCap, RotateCcw } from "lucide-react";
import type { UrgentItem } from "@/lib/dashboard/urgentItems";
import { cn } from "@/lib/utils";

export type UrgentResolution = "complete" | "still-doing" | "not-relevant";

interface Props {
  items: UrgentItem[];
  loading?: boolean;
  busyId?: string | null;
  onResolve: (item: UrgentItem, resolution: UrgentResolution) => void;
}

const toneText: Record<UrgentItem["tone"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
};

export function UrgentAttentionView({ items, loading = false, busyId = null, onResolve }: Props) {
  if (loading) {
    return <div role="status" aria-label="Loading what needs attention" className="h-16 animate-pulse rounded-2xl bg-muted/40" />;
  }
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Needs attention"
      className="overflow-hidden rounded-2xl border border-warning/35 bg-warning/5 shadow-sm"
    >
      <h2 className="flex items-center gap-1.5 px-3.5 pt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-warning">
        <AlertTriangle className="h-3 w-3" aria-hidden /> Needs attention
      </h2>
      <ul className="px-1.5 py-1.5">
        {items.slice(0, 4).map((item) => (
          <li key={`${item.kind}-${item.id}`} className="rounded-xl px-2 py-1.5">
            <div className="flex items-center gap-2.5">
              {item.kind === "exam"
                ? <GraduationCap className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                : <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{item.title}</span>
                <span className={cn("block truncate text-[11px]", toneText[item.tone])}>
                  {item.className} · {item.when}
                  {item.stale && " · still open"}
                </span>
              </span>
              {item.kind === "exam" && item.classId && (
                <Link
                  to={`/study-lab?classId=${encodeURIComponent(item.classId)}&examId=${encodeURIComponent(item.id)}`}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Prepare
                </Link>
              )}
            </div>

            {item.kind === "assignment" && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[26px]">
                <ResolveButton
                  label="Done"
                  icon={Check}
                  disabled={busyId === item.id}
                  onClick={() => onResolve(item, "complete")}
                />
                <ResolveButton
                  label="Still doing it"
                  icon={RotateCcw}
                  disabled={busyId === item.id}
                  onClick={() => onResolve(item, "still-doing")}
                />
                <ResolveButton
                  label="Not relevant"
                  icon={CircleSlash}
                  disabled={busyId === item.id}
                  onClick={() => onResolve(item, "not-relevant")}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResolveButton({
  label, icon: Icon, disabled, onClick,
}: {
  label: string;
  icon: typeof Check;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
    >
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </button>
  );
}
