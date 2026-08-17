/** Supabase-backed container for the shared dashboard coach presentation. */
import { CoachHeroView, type CoachWeakSpotModel } from "./CoachHeroView";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import { useCoachFunction } from "@/lib/coachFunctions/useCoachFunction";
import type { WhatAmIForgettingPayload } from "@/lib/coachFunctions/functions/whatAmIForgetting";
import { Button } from "@/components/ui/button";

export function RealCoachHero() {
  const { recommendations, loading, error, reload } = useCoachRecommendations();
  const forgetting = useCoachFunction<{ limit?: number }, WhatAmIForgettingPayload>("what_am_i_forgetting");
  const result = forgetting.result;

  const weakSpots: CoachWeakSpotModel = {
    loading: forgetting.loading,
    status: result?.status ?? "idle",
    summary: result?.summary,
    items: result?.status === "ok"
      ? result.payload.items.map((item) => ({
          id: item.conceptId,
          name: item.conceptName,
          reason: item.reason,
        }))
      : [],
    onCheck: () => { void forgetting.execute({ limit: 6 }); },
  };

  if (error) {
    return (
      <section className="rounded-3xl border border-warning/30 bg-warning/5 p-5" aria-live="polite">
        <h2 className="font-display text-xl font-semibold text-foreground">Couldn’t load today’s focus</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your classes and study progress are still safe. Try again before following a recommendation.
        </p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => { void reload(); }}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <CoachHeroView
      recommendations={recommendations}
      loading={loading}
      weakSpots={weakSpots}
    />
  );
}
