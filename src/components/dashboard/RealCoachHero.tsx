/** Supabase-backed container for the shared dashboard coach presentation. */
import { CoachHeroView, type CoachWeakSpotModel } from "./CoachHeroView";
import { useCoachRecommendations } from "@/lib/coach/useCoachRecommendations";
import { useCoachFunction } from "@/lib/coachFunctions/useCoachFunction";
import type { WhatAmIForgettingPayload } from "@/lib/coachFunctions/functions/whatAmIForgetting";

export function RealCoachHero() {
  const { recommendations, loading } = useCoachRecommendations();
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

  return (
    <CoachHeroView
      recommendations={recommendations}
      loading={loading}
      weakSpots={weakSpots}
    />
  );
}
