/**
 * RealCoachHero — one calm, cohesive recommendation surface.
 *
 * The default view contains only the highest-leverage action. Evidence,
 * weak-spot checks, and secondary recommendations remain available behind
 * "Why this is first" so no capability is lost and the dashboard stays calm.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Camera,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  Repeat,
  Sparkles,
} from "lucide-react";
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
  study: "Start study",
  review: "Start review",
  capture: "Capture now",
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
  const href = coachActionHref(top);
  const visibleEvidence = top.evidence[0];

  return (
    <motion.section
      aria-labelledby="today-focus-title"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-[30px] border border-primary/35 bg-gradient-to-br from-card/95 via-card/90 to-primary/10 p-5 shadow-elegant md:p-7"
    >
      <div className="pointer-events-none absolute inset-0 opacity-75" aria-hidden>
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[105px]" />
        <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent/15 blur-[110px]" />
      </div>

      <div className="relative">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-[10.5px] uppercase tracking-[0.22em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Today&apos;s focus
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-calm shadow-elegant">
            <Icon className="h-6 w-6 text-primary-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="today-focus-title" className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
              {top.className}
            </h2>
            <p className="mt-1 break-words text-lg font-medium leading-snug text-primary md:text-xl">
              {top.why}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" />
                {top.minutes} min
              </span>
              {top.impact.readinessDelta > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>Est. <strong className="font-semibold text-primary">+{top.impact.readinessDelta} points</strong></span>
                </>
              )}
            </div>

            {visibleEvidence && (
              <p className="mt-4 break-words border-t border-border/40 pt-4 text-sm leading-relaxed text-muted-foreground">
                <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
                Recommended because {evidenceSentence(visibleEvidence.label)}.
              </p>
            )}
          </div>
        </div>

        <Link
          to={href}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-calm px-5 text-base font-semibold text-primary-foreground shadow-elegant transition-opacity hover:opacity-95 active:scale-[0.995]"
        >
          {ACTION_VERB[top.action]}
          <ArrowRight className="h-5 w-5" />
        </Link>

        <button
          type="button"
          aria-expanded={showWhy}
          onClick={() => setShowWhy((value) => !value)}
          className="mx-auto mt-3 flex min-h-11 items-center justify-center gap-1.5 px-3 text-xs text-primary transition-colors hover:text-foreground"
        >
          <Info className="h-4 w-4" />
          {showWhy ? "Hide details" : "Why this is first"}
        </button>

        <AnimatePresence initial={false}>
          {showWhy && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-4 rounded-2xl border border-border/40 bg-background/35 p-4">
                <ul className="space-y-2" aria-label="Recommendation evidence">
                  {top.evidence.map((e, index) => (
                    <li key={`${e.type}-${index}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      <span>{e.label}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-border/40 pt-3">
                  <button
                    type="button"
                    onClick={() => void forgetting.execute({ limit: 6 })}
                    disabled={forgetting.loading}
                    className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    {forgetting.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    Check weak spots
                  </button>

                  {forgetting.result?.status === "ok" && forgetting.result.payload && (
                    <div className="mt-2">
                      <p className="text-xs text-foreground">{forgetting.result.summary}</p>
                      <ul className="mt-2 space-y-1.5">
                        {(forgetting.result.payload as WhatAmIForgettingPayload).items.slice(0, 5).map((item) => (
                          <li key={item.conceptId} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground">{item.conceptName}</span>
                            <span className="shrink-0 text-muted-foreground">{item.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {forgetting.result?.status === "empty" && (
                    <p className="mt-2 text-xs text-muted-foreground">{forgetting.result.summary}</p>
                  )}
                </div>

                {recommendations.length > 1 && (
                  <div className="border-t border-border/40 pt-3">
                    <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Study another class</p>
                    <ul className="space-y-1">
                      {recommendations.slice(1, 4).map((recommendation) => (
                        <li key={recommendation.id}>
                          <Link
                            to={coachActionHref(recommendation)}
                            className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm text-foreground transition-colors hover:bg-primary/5"
                          >
                            <span className="min-w-0 flex-1 truncate">{recommendation.className}</span>
                            <span className="truncate text-xs text-muted-foreground">{recommendation.why}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function evidenceSentence(value: string) {
  const trimmed = value.trim().replace(/[.!?]+$/, "");
  if (!trimmed) return "this is your highest-impact next step";
  return trimmed;
}

function coachActionHref(recommendation: {
  action: CoachActionKind;
  classId: string;
  conceptIds: string[];
}) {
  if (recommendation.action === "capture") return `/classes/${recommendation.classId}`;

  const params = new URLSearchParams({ classId: recommendation.classId });
  if (recommendation.conceptIds.length) {
    params.set("conceptIds", recommendation.conceptIds.slice(0, 8).join(","));
  }
  return `/study-lab?${params.toString()}`;
}
