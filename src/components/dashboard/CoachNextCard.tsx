/**
 * Recommended next — exactly one compact coach card.
 *
 * Never outranks the student's school situation above it, and never shows an
 * unexplained point promise: any secondary line must be grounded in concepts
 * the recommendation actually targets.
 */
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Camera, Clock3, Repeat, Sparkles } from "lucide-react";
import type { CoachActionKind, CoachRecommendation } from "@/lib/coach/recommend";

const ACTION_ICON: Record<CoachActionKind, React.ElementType> = {
  study: BookOpen,
  review: Repeat,
  capture: Camera,
  debrief: Sparkles,
};

const ACTION_VERB: Record<CoachActionKind, string> = {
  study: "Start",
  review: "Continue",
  capture: "Capture",
  debrief: "Debrief",
};

export function coachActionHref(recommendation: CoachRecommendation) {
  if (recommendation.action === "capture") {
    return `/classes/${encodeURIComponent(recommendation.classId)}?capture=1`;
  }
  const params = new URLSearchParams({ classId: recommendation.classId });
  if (recommendation.conceptIds.length) {
    params.set("conceptIds", recommendation.conceptIds.slice(0, 8).join(","));
  }
  return `/study-lab?${params.toString()}`;
}

export function CoachNextCard({
  recommendation,
  loading = false,
}: {
  recommendation: CoachRecommendation | null;
  loading?: boolean;
}) {
  if (loading) {
    return <div role="status" aria-label="Loading recommendation" className="h-[96px] animate-pulse rounded-2xl bg-muted/40" />;
  }
  if (!recommendation) return null;

  const Icon = ACTION_ICON[recommendation.action];
  const targeted = recommendation.conceptIds.length;

  return (
    <section aria-labelledby="dashboard-coach-title" className="space-y-2.5">
      <h2 id="dashboard-coach-title" className="px-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Recommended next
      </h2>

      <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-card/70 p-3.5 shadow-sm backdrop-blur-md">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-calm" aria-hidden>
          <Icon className="h-5 w-5 text-primary-foreground" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{recommendation.className}</p>
          <p className="truncate text-xs text-primary">{recommendation.why}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {recommendation.minutes} min
            {targeted > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>Targets {targeted} weak {targeted === 1 ? "concept" : "concepts"}</span>
              </>
            )}
          </p>
        </div>

        <Link
          to={coachActionHref(recommendation)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-calm px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
        >
          {ACTION_VERB[recommendation.action]}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
