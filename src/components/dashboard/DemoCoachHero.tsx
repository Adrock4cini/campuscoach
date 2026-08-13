import { useState } from "react";
import { CoachHeroView } from "./CoachHeroView";
import type { DemoDashboardModel } from "@/lib/demo/dashboardSampleAdapter";

/** Sample-only adapter. It owns no authenticated hooks and performs no writes. */
export function DemoCoachHero({ model }: { model: DemoDashboardModel }) {
  const [checked, setChecked] = useState(false);

  return (
    <CoachHeroView
      recommendations={model.recommendations}
      actionFor={(recommendation) => ({
        href: `/classes/${encodeURIComponent(recommendation.classId)}`,
        label: "Open class",
      })}
      weakSpots={{
        loading: false,
        status: checked ? "ok" : "idle",
        summary: checked ? "These sample concepts would be prioritized next." : undefined,
        items: checked ? model.weakSpots : [],
        onCheck: () => setChecked(true),
      }}
    />
  );
}
