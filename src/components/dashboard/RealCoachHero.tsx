/**
 * RealCoachHero — the Dashboard's tutor voice for real users.
 *
 * Renders the top-ranked recommendation from `useCoachRecommendations`.
 * Shows one sentence (`why`) but preserves the structured `evidence`
 * array in a small chip row so the student can see WHY without
 * a redesigned drawer.
 *
 * No new UI system — reuses existing tokens/components.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Camera, BookOpen, Repeat } from "lucide-react";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import type { CoachActionKind } from "@/lib/coach/recommend";

const ACTION_ICON: Record<CoachActionKind, React.ElementType> = {
  study: BookOpen,
  review: Repeat,
  capture: Camera,
  debrief: Sparkles,
};

const ACTION_VERB: Record<CoachActionKind, string> = {
  study: "Study now",
  review: "Review now",
  capture: "Capture something",
  debrief: "Debrief",
};

export function RealCoachHero() {
  const { recommendations, loading } = useCoachRecommendations();

  if (loading) return null;
  const top = recommendations[0];
  if (!top) return null;

  const Icon = ACTION_ICON[top.action];
  const href =
    top.action === "capture"
      ? `/class/${top.classId}`
      : `/study-lab?classId=${encodeURIComponent(top.classId)}`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[28px] border border-primary/30 glass shadow-elegant p-6 md:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-2xl bg-gradient-calm flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1">
            <Sparkles className="h-3 w-3" /> Coach · next {top.minutes} min
          </div>
          <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            {top.className}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{top.why}</p>

          {top.evidence.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {top.evidence.slice(0, 4).map((e, i) => (
                <span
                  key={`${e.type}-${i}`}
                  title={`weight ${(e.weight * 100).toFixed(0)}%`}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground bg-background/40"
                >
                  <span className="uppercase tracking-wider text-[9px] text-foreground/60">
                    {e.type}
                  </span>
                  <span className="text-foreground/80">{e.label}</span>
                </span>
              ))}
              {top.impact.readinessDelta > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  +{top.impact.readinessDelta}% readiness
                </span>
              )}
            </div>
          )}

          <div className="mt-4">
            <Link
              to={href}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl bg-gradient-calm text-primary-foreground text-sm font-semibold shadow-elegant hover:opacity-95"
            >
              {ACTION_VERB[top.action]}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {recommendations.length > 1 && (
        <div className="mt-5 pt-4 border-t border-border/40">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Then
          </p>
          <ul className="space-y-1.5">
            {recommendations.slice(1, 4).map((r) => {
              const RIcon = ACTION_ICON[r.action];
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border border-border/30 hover:border-border/70 bg-background/30 px-3 py-2 text-sm"
                >
                  <RIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate text-foreground">
                    <span className="text-muted-foreground">{r.className} · </span>
                    {r.why}
                  </span>
                  {r.impact.readinessDelta > 0 && (
                    <span className="text-[11px] tabular-nums text-primary">
                      +{r.impact.readinessDelta}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.section>
  );
}
