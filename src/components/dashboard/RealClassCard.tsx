import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import type { ClassAlert } from "@/lib/dashboard/classAlerts";
import { cn } from "@/lib/utils";

const alertTone: Record<ClassAlert["tone"], string> = {
  danger: "text-danger",
  warning: "text-warning",
  calm: "text-muted-foreground",
};

/**
 * A compact class summary. Capture and Study remain globally available in the
 * mobile navigation and inside the class command center; the dashboard row's
 * one job is to surface each class's single most important alert and open the
 * right class.
 */
export function RealClassCard({ c, index = 0, alert }: { c: ClassInfo; index?: number; alert?: ClassAlert }) {
  const supportingText = c.currentTopic && c.currentTopic !== "Getting started"
    ? c.currentTopic
    : c.professor && c.professor !== "TBD"
      ? c.professor
      : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28 }}
      className="border-b border-border/40 last:border-b-0"
    >
      <Link
        to={`/classes/${encodeURIComponent(c.id)}`}
        aria-label={`Open ${c.name}`}
        className="group flex min-h-[82px] items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/5 active:bg-primary/10 md:px-5"
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-base font-semibold text-primary-foreground shadow-sm",
            c.color,
          )}
          aria-hidden
        >
          {c.name.trim().charAt(0)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg font-semibold leading-tight text-foreground">
            {c.name}
          </span>
          {alert ? (
            <>
              <span className={cn("mt-1 block truncate text-xs font-medium", alertTone[alert.tone])}>
                {alert.text}
              </span>
              {alert.secondary && (
                <span className="block truncate text-[10px] text-muted-foreground">{alert.secondary}</span>
              )}
            </>
          ) : (
            supportingText && (
              <span className="mt-1 block truncate text-xs text-muted-foreground">{supportingText}</span>
            )
          )}
        </span>

        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </motion.article>
  );
}
