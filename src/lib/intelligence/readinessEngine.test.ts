import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveReadiness,
  updateReadinessAfterStudy,
} from "./readinessEngine";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  getAnonUserId: vi.fn(() => "student-1"),
  saveCampusBrainSignal: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  getAnonUserId: mocks.getAnonUserId,
}));

vi.mock("@/lib/supabase/capturePersistence", () => ({
  saveCampusBrainSignal: mocks.saveCampusBrainSignal,
}));

const outcome = {
  classId: "psych101",
  mode: "flashcards",
  topic: "Memory models",
  durationMinutes: 10,
  accuracy: 80,
  completed: true,
  captureId: "capture-1",
};

describe("readiness persistence boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.from.mockReset().mockReturnValue({ insert: mocks.insert });
    mocks.getAnonUserId.mockClear();
    mocks.saveCampusBrainSignal.mockReset().mockResolvedValue(true);
  });

  it("keeps demo readiness and momentum device-local", async () => {
    const before = getEffectiveReadiness(outcome.classId);
    const change = await updateReadinessAfterStudy(outcome, {
      persistence: "local-only",
    });

    expect(change.newReadiness).toBeGreaterThan(before);
    expect(getEffectiveReadiness(outcome.classId)).toBe(change.newReadiness);
    expect(mocks.getAnonUserId).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.saveCampusBrainSignal).not.toHaveBeenCalled();
  });

  it("preserves signed-in study session and Campus Brain writes", async () => {
    await updateReadinessAfterStudy(outcome, { persistence: "remote" });

    expect(mocks.getAnonUserId).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("study_sessions");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "student-1",
        client_class_id: "psych101",
        mode: "flashcards",
        topic: "Memory models",
      }),
    );
    expect(mocks.saveCampusBrainSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        clientClassId: "psych101",
        sourceType: "study-complete:flashcards",
        sourceId: "capture-1",
      }),
      "student-1",
    );
  });
});
