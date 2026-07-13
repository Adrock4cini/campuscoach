/**
 * RealCoachHero — the Dashboard's tutor voice for real users.
 *
 * Presentation refresh (UX polish sprint):
 *  - One dominant CTA card that reads as a single tappable surface on mobile.
 *  - Secondary recommendations become large, tappable rows below.
 *  - Evidence stays in the data model but is condensed visually to reduce
 *    competing chips near the primary action.
 *
 * No functional changes.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Camera, BookOpen, Repeat, ChevronRight, Info, Brain, Loader2 } from "lucide-react";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import { useCoachFunction } from "@/lib/coachFunctions/useCoachFunction";
import type { WhatAmIForgettingPayload } from "@/lib/coachFunctions/functions/whatAmIForgetting";
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
    <div className="space-y-3">
      {/* Primary — one big tappable card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Link
          to={href}
          className="group relative block overflow-hidden rounded-[28px] border border-primary/30 glass shadow-elegant p-6 md:p-7 active:scale-[0.995] transition-transform"
        >
          <div className="absolute inset-0 pointer-events-none opacity-70">
            <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-primary/20 blur-[100px]" />
            <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/15 blur-[100px]" />
          </div>

          <div className="relative flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-calm flex items-center justify-center flex-shrink-0 shadow-elegant">
              <Icon className="h-5 w-5 text-primary-foreground" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.22em] text-primary/90 mb-1">
                <Sparkles className="h-3 w-3" /> Coach · next {top.minutes} min
              </div>
              <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-tight">
                {top.className}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {top.why}
              </p>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl bg-gradient-calm text-primary-foreground text-sm font-semibold shadow-elegant group-hover:opacity-95">
                  {ACTION_VERB[top.action]}
                  <ArrowRight className="h-4 w-4" />
                </span>
                {top.impact.readinessDelta > 0 && (
                  <span className="inline-flex items-center text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
                    +{top.impact.readinessDelta}% readiness
                  </span>
                )}
              </div>

              {top.evidence.length > 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground/80 truncate">
                  {top.evidence
                    .slice(0, 3)
                    .map((e) => e.label)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Secondary — large tappable rows */}
      {recommendations.length > 1 && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Then
          </p>
          <ul className="space-y-1.5">
            {recommendations.slice(1, 4).map((r) => {
              const RIcon = ACTION_ICON[r.action];
              const rhref =
                r.action === "capture"
                  ? `/class/${r.classId}`
                  : `/study-lab?classId=${encodeURIComponent(r.classId)}`;
              return (
                <li key={r.id}>
                  <Link
                    to={rhref}
                    className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 hover:bg-card/70 hover:border-border/70 px-4 py-3 min-h-[64px] transition-colors active:scale-[0.995]"
                  >
                    <span className="h-9 w-9 rounded-xl bg-background/60 flex items-center justify-center shrink-0">
                      <RIcon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {r.className}
                      </span>
                      <span className="block text-sm text-foreground truncate">
                        {r.why}
                      </span>
                    </span>
                    {r.impact.readinessDelta > 0 && (
                      <span className="text-[11px] tabular-nums text-primary shrink-0">
                        +{r.impact.readinessDelta}%
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
