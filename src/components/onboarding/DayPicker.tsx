import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      {DAYS.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(active ? value.filter((x) => x !== d) : [...value, d])
            }
            className={cn(
              "text-xs px-2.5 py-1 rounded-md border transition-colors",
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
