import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSupabaseNetworkMode } from "@/lib/demo/supabaseNetworkPolicy";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

import {
  contributeStudySignal,
  type AggregatedDebrief,
  useClassIntelligence,
} from "./useClassIntelligence";

describe("useClassIntelligence demo boundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
    setSupabaseNetworkMode("loading");
  });

  it("returns fixed sample data without reads or realtime subscriptions", async () => {
    const { result } = renderHook(() => useClassIntelligence("psych101", "demo"));

    expect(result.current.loading).toBe(false);
    expect(result.current.topics[0].topic_name).toBe("Memory models");
    expect(result.current.totalContributors).toBe(24);

    await act(async () => result.current.reload());

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });

  it("adds a demo debrief to on-screen totals without mutating the fixture", () => {
    const localDebrief: AggregatedDebrief = {
      id: "local-1",
      class_id: "psych101",
      exam_name: "Practice exam",
      date_taken: "2026-08-13",
      topics_mentioned: ["Retrieval cues"],
      format_tags: ["short-answer"],
      study_more_tags: ["Interference theory"],
      difficulty: 5,
      time_pressure: 4,
      confidence: 2,
      advice_notes: "Practice retrieval before reviewing notes.",
      created_at: "2026-08-13T18:00:00.000Z",
    };
    const { result } = renderHook(() => (
      useClassIntelligence("psych101", "demo", [localDebrief])
    ));

    expect(result.current.debriefs[0].id).toBe("local-1");
    expect(result.current.totalContributors).toBe(25);
    expect(result.current.weeklyContributions).toBe(9);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("turns every demo study contribution into a local no-op", async () => {
    setSupabaseNetworkMode("demo");

    const result = await contributeStudySignal({
      classId: "psych101",
      topicId: "memory-models",
      topicName: "Memory models",
    });

    expect(result).toEqual({ data: null, error: null, demoOnly: true });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("preserves the existing Supabase read and realtime path in real mode", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      gte: vi.fn(),
      then: (resolve: (value: { data: never[]; count: number }) => unknown) => (
        Promise.resolve({ data: [], count: 0 }).then(resolve)
      ),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    mocks.channel.mockReturnValue(channel);

    const { result, unmount } = renderHook(() => useClassIntelligence("psych101", "real"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.from).toHaveBeenCalledTimes(5);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
});
