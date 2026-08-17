import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * A compact navigation rail for students who arrive knowing which class they
 * need. The Coach recommendation remains the primary dashboard action below.
 */
export function ClassShortcutRail({ classes }: { classes: ClassInfo[] }) {
  if (classes.length === 0) return null;

  return (
    <nav aria-label="Class shortcuts" className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Jump to a class
        </p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {classes.length} {classes.length === 1 ? "class" : "classes"}
        </span>
      </div>

      <ul className="flex max-w-full snap-x snap-proximity gap-2.5 overflow-x-auto px-1 pb-2 pt-1 pr-8">
        {classes.map((classInfo) => (
          <li key={classInfo.id} className="snap-start">
            <Link
              to={`/classes/${encodeURIComponent(classInfo.id)}`}
              aria-label={classInfo.courseCode
                ? `Open ${classInfo.courseCode}, ${classInfo.name}`
                : `Open ${classInfo.name}`}
              className="group flex h-[84px] w-[98px] flex-col justify-between rounded-2xl border border-border/50 bg-card/65 p-2.5 shadow-sm backdrop-blur-md transition-colors hover:border-primary/35 hover:bg-primary/5 active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl font-display text-sm font-semibold text-primary-foreground shadow-sm",
                  classInfo.color,
                )}
                aria-hidden
              >
                {classInfo.name.trim().charAt(0).toUpperCase() || "C"}
              </span>

              <span className="min-w-0">
                {classInfo.courseCode && (
                  <span className="block truncate text-[9px] font-medium uppercase tracking-[0.12em] text-primary">
                    {classInfo.courseCode}
                  </span>
                )}
                <span className={cn(
                  "block text-xs font-semibold leading-tight text-foreground",
                  classInfo.courseCode ? "truncate" : "line-clamp-2",
                )}>
                  {classInfo.name}
                </span>
              </span>
            </Link>
          </li>
        ))}

        <li className="snap-start">
          <Link
            to="/classes"
            aria-label="Open all classes"
            className="flex h-[84px] w-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/70 bg-background/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:text-primary active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <BookOpen className="h-5 w-5" aria-hidden />
            All
          </Link>
        </li>
      </ul>
    </nav>
  );
}
