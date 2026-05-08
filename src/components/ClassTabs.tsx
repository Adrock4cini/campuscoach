import { motion } from "framer-motion";
import { classes } from "@/data/demo";
import { cn } from "@/lib/utils";

interface ClassTabsProps {
  value: string | "all";
  onChange: (id: string | "all") => void;
  showAll?: boolean;
  className?: string;
}

/**
 * Persistent class-first filter shown at the top of major pages.
 * Lets students mentally stay "inside" a single class.
 */
export function ClassTabs({ value, onChange, showAll = true, className }: ClassTabsProps) {
  const items = showAll
    ? [{ id: "all" as const, name: "All", color: "bg-muted-foreground" }, ...classes]
    : classes;

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {items.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id as any)}
              className={cn(
                "relative flex items-center gap-2 px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all",
                "border backdrop-blur",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                  : "border-border/50 bg-background/30 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", c.color)} />
              <span className="font-medium tracking-tight">
                {c.id === "all" ? "All Classes" : c.name.split(" ").slice(0, 2).join(" ")}
              </span>
              {active && (
                <motion.span
                  layoutId="class-tab-glow"
                  className="absolute inset-0 rounded-full ring-1 ring-primary/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
