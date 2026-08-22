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
import type { CoachActionKind, CoachRecommendation } from "@/lib/coach/recommend";
import { READINESS_MEANING } from "@/lib/intelligence/testReadinessLabel";

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

export interface CoachWeakSpotItem {
  id: string;
  name: string;
  reason: string;
}

export interface CoachWeakSpotModel {
  loading: boolean;
  status: "idle" | "ok" | "empty" | "error";
  summary?: string;
  items?: CoachWeakSpotItem[];
  onCheck: () => void;
}

interface CoachHeroViewProps {
  recommendations: CoachRecommendation[];
  loading?: boolean;
  weakSpots: CoachWeakSpotModel;
  actionFor?: (recommendation: CoachRecommendation) => {
    href: string;
    label: string;
  };
}

/** Shared dashboard coach presentation. Data access stays in mode-specific containers. */
export function CoachHeroView({ recommendations, loading = false, weakSpots, actionFor }: CoachHeroViewProps) {
  const [showWhy, setShowWhy] = useState(false);

  if (loading) return null;
  const top = recommendations[0];
  if (!top) return null;

  const Icon = ACTION_ICON[top.action];
  // The headline already states the reason. Repeating essentially the same
  // sentence under "Recommended because" is noise, so show the first piece of
  // evidence that actually adds something new — or nothing at all.
  const visibleEvidence = top.evidence.find((item) => !isRedundantEvidence(top.why, item.label));
  const topAction = actionFor?.(top) ?? defaultCoachAction(top);


  return (
    <motion.section
      aria-labelledby="today-focus-title"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-md md:p-5"
    >
      <div className="relative">
        <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          Recommended next
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-calm shadow-sm">
            <Icon className="h-5 w-5 text-primary-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="today-focus-title" className="font-display text-lg font-semibold leading-tight tracking-tight text-foreground md:text-xl">
              {top.className}
            </h2>
            <p className="mt-0.5 break-words text-sm font-medium leading-snug text-primary">
              {top.why}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" />
                {top.minutes} min
              </span>
              {top.impact.readinessDelta > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span title={READINESS_MEANING}>
                    Should move test readiness up about{" "}
                    <strong className="font-semibold text-primary">{top.impact.readinessDelta} points</strong>
                  </span>
                </>
              )}
            </div>

            {visibleEvidence && (
              <p className="mt-3 break-words border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
                <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
                Recommended because {evidenceSentence(visibleEvidence.label)}.
              </p>
            )}
          </div>
        </div>

        <Link
          to={topAction.href}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-calm px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95 active:scale-[0.995]"
        >
          {topAction.label}
          <ArrowRight className="h-4 w-4" />
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
                    onClick={weakSpots.onCheck}
                    disabled={weakSpots.loading}
                    className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    {weakSpots.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    Check weak spots
                  </button>

                  {weakSpots.status === "ok" && (
                    <div className="mt-2">
                      {weakSpots.summary && <p className="text-xs text-foreground">{weakSpots.summary}</p>}
                      <ul className="mt-2 space-y-1.5">
                        {(weakSpots.items ?? []).slice(0, 5).map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground">{item.name}</span>
                            <span className="shrink-0 text-muted-foreground">{item.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(weakSpots.status === "empty" || weakSpots.status === "error") && weakSpots.summary && (
                    <p className="mt-2 text-xs text-muted-foreground">{weakSpots.summary}</p>
                  )}
                </div>

                {recommendations.length > 1 && (
                  <div className="border-t border-border/40 pt-3">
                    <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {actionFor ? "Open another class" : "Study another class"}
                    </p>
                    <ul className="space-y-1">
                      {recommendations.slice(1, 4).map((recommendation) => (
                        <li key={recommendation.id}>
                          <Link
                            to={(actionFor?.(recommendation) ?? defaultCoachAction(recommendation)).href}
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

function normalizeReason(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(\d+)\s*(d|day|days)\b/g, "$1 days")
    .trim();
}

/** True when the evidence line restates the headline instead of adding evidence. */
export function isRedundantEvidence(why: string, label: string) {
  const a = normalizeReason(why);
  const b = normalizeReason(label);
  if (!a || !b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aWords = new Set(a.split(" ").filter((word) => word.length > 2));
  const bWords = b.split(" ").filter((word) => word.length > 2);
  if (!bWords.length) return true;
  const shared = bWords.filter((word) => aWords.has(word)).length;
  return shared / bWords.length >= 0.7;
}


function defaultCoachAction(recommendation: CoachRecommendation) {
  if (recommendation.action === "capture") {
    return {
      href: `/classes/${encodeURIComponent(recommendation.classId)}?capture=1`,
      label: ACTION_VERB[recommendation.action],
    };
  }

  const params = new URLSearchParams({ classId: recommendation.classId });
  if (recommendation.conceptIds.length) {
    params.set("conceptIds", recommendation.conceptIds.slice(0, 8).join(","));
  }
  return {
    href: `/study-lab?${params.toString()}`,
    label: ACTION_VERB[recommendation.action],
  };
}
