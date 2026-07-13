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
  const [showWhy, setShowWhy] = useState(false);
  const forgetting = useCoachFunction<{ limit?: number }, WhatAmIForgettingPayload>("what_am_i_forgetting");

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
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowWhy((v) => !v); }}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/90 hover:text-foreground transition-colors"
                  >
                    <Info className="h-3 w-3" />
                    {showWhy ? "Hide why" : "Why?"}
                  </button>
                  <AnimatePresence initial={false}>
                    {showWhy && (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 space-y-1 overflow-hidden"
                      >
                        {top.evidence.map((e, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span className="truncate">
                              <span className="uppercase tracking-wider text-[9.5px] text-primary/80 mr-1.5">{e.type}</span>
                              {e.label}
                            </span>
                            <span className="tabular-nums shrink-0 opacity-70">
                              {Math.round(e.weight * 100)}%
                            </span>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </Link>
      </motion.div>

      {/* What am I forgetting? — runs a coach function directly, in-place. */}
      <div className="px-1">
        <button
          type="button"
          onClick={() => void forgetting.execute({ limit: 6 })}
          disabled={forgetting.loading}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
        >
          {forgetting.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
          What am I forgetting?
        </button>
        {forgetting.result?.status === "ok" && forgetting.result.payload && (
          <div className="mt-2 rounded-2xl border border-border/40 bg-card/50 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {forgetting.result.title}
            </p>
            <p className="text-xs text-foreground mb-2">{forgetting.result.summary}</p>
            <ul className="space-y-1">
              {(forgetting.result.payload as WhatAmIForgettingPayload).items.slice(0, 5).map((it) => (
                <li key={it.conceptId} className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-foreground">{it.conceptName}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{it.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {forgetting.result?.status === "empty" && (
          <p className="mt-2 text-[11px] text-muted-foreground">{forgetting.result.summary}</p>
        )}
      </div>

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
