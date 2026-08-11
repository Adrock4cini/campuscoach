import { cn } from "@/lib/utils";
import { normalizeWeekdays, WEEKDAYS } from "@/lib/calendar/classSchedule";

export function DayPicker({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (days: string[]) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Class days">
      {WEEKDAYS.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(normalizeWeekdays(active ? value.filter((x) => x !== d) : [...value, d]))
            }
            className={cn(
              "inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-2 text-xs transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:border-primary/50"
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}
