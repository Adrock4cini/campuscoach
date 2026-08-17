import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * A compact class summary. Capture and Study remain globally available in the
 * mobile navigation and inside the class command center; the dashboard row's
 * one job is to help students scan readiness and open the right class.
 */
export function RealClassCard({ c, index = 0 }: { c: ClassInfo; index?: number }) {
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
        aria-label={`Open ${c.name}, ${c.readiness}% ready`}
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
          {supportingText && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">{supportingText}</span>
          )}
        </span>

        <ReadinessRing value={c.readiness} />
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </motion.article>
  );
}

function ReadinessRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / 100) * circumference;

  return (
    <span
      className="relative flex h-12 w-12 shrink-0 items-center justify-center"
      role="img"
      aria-label={`${safeValue}% ready`}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/70" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary"
        />
      </svg>
      <span className="text-[10px] font-semibold tabular-nums text-foreground">{safeValue}%</span>
    </span>
  );
}
