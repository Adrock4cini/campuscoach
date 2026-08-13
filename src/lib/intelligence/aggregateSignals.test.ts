import { afterEach, describe, expect, it, vi } from "vitest";
import { setSupabaseNetworkMode } from "@/lib/demo/supabaseNetworkPolicy";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

import {
  getAggregateInsightsForClass,
  updateCampusBrainAggregate,
} from "./aggregateSignals";

describe("aggregate signal demo boundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
    setSupabaseNetworkMode("loading");
  });

  it("builds aggregate insights from the fixture without a Supabase read", async () => {
    setSupabaseNetworkMode("demo");

    const insights = await getAggregateInsightsForClass("math150");

    expect(insights.map((insight) => insight.id)).toEqual([
      "trend:graphing-polynomials",
      "miss:polynomial-division",
      "exam:graphing-polynomials",
    ]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("drops demo writes locally before importing a user id or constructing a query", async () => {
    setSupabaseNetworkMode("demo");

    const saved = await updateCampusBrainAggregate({
      sourceType: "study_session",
      clientClassId: "math150",
      topic: "Finding zeros",
    });

    expect(saved).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("stays empty while authentication is unresolved", async () => {
    setSupabaseNetworkMode("loading");

    expect(await getAggregateInsightsForClass("psych101")).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
