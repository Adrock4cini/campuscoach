import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { recordMemoryTrickFeedback } from "./memoryFeedback";

describe("memory-trick feedback", () => {
  beforeEach(() => rpc.mockReset());

  it("sends only the fixed owner-validated RPC fields", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(recordMemoryTrickFeedback({
      artifactId: "artifact-1",
      conceptId: "concept-1",
      technique: "association",
      helpful: true,
    })).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("record_memory_trick_feedback", {
      p_artifact_id: "artifact-1",
      p_concept_id: "concept-1",
      p_technique: "association",
      p_helpful: true,
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("mnemonic");
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("classId");
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("userId");
  });

  it("fails quietly when feedback cannot be stored", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(recordMemoryTrickFeedback({
      artifactId: "artifact-1",
      conceptId: "concept-1",
      technique: "story",
      helpful: false,
    })).resolves.toBe(false);

    rpc.mockRejectedValueOnce(new Error("offline"));
    const rejectedResult = await recordMemoryTrickFeedback({
      artifactId: "artifact-1",
      conceptId: "concept-1",
      technique: "story",
      helpful: false,
    });
    expect(rejectedResult).toBe(false);
  });
});
