import { describe, expect, it } from "vitest";
import { explainReadiness } from "./readinessExplanation";

const base = { conceptCount: 0, strengths: [], attempts: 0, captureCount: 0 };

describe("explainReadiness", () => {
  it("shows no false precision when the class is empty", () => {
    const r = explainReadiness(base);
    expect(r.status).toBe("no-data");
    expect(r.percent).toBeNull();
    expect(r.label).toBe("Not enough info yet");
  });

  it("stays qualitative while evidence is thin", () => {
    const r = explainReadiness({ ...base, conceptCount: 4, captureCount: 1, attempts: 1, strengths: [0.3] });
    expect(r.status).toBe("early");
    expect(r.percent).toBeNull();
    expect(r.label).toBe("Still learning");
  });

  it("scores once there are enough concepts and attempts", () => {
    const r = explainReadiness({
      conceptCount: 6,
      captureCount: 2,
      attempts: 12,
      strengths: [0.9, 0.8, 0.7, 0.7, 0.6, 0.5],
    });
    expect(r.status).toBe("scored");
    expect(r.percent).toBe(70);
    expect(r.weakCount).toBe(0);
  });

  it("counts active concepts without mastery as zero evidence", () => {
    const r = explainReadiness({
      conceptCount: 5,
      captureCount: 1,
      attempts: 5,
      strengths: [1],
    });
    expect(r.status).toBe("scored");
    expect(r.percent).toBe(20);
    expect(r.weakCount).toBe(4);
    expect(r.headline).toBe("You're solid on 1 concept; 4 concepts are not yet strong.");
    expect(r.factors).toContainEqual(expect.objectContaining({
      label: "Needs attention",
      detail: "4 concepts need practice",
    }));
  });

  it("surfaces exam pressure and overdue work as factors", () => {
    const r = explainReadiness({
      conceptCount: 6,
      captureCount: 2,
      attempts: 12,
      strengths: [0.6, 0.6, 0.6],
      daysToExam: 2,
      overdueAssignments: 1,
    });
    expect(r.factors.some((f) => f.label === "Next test" && f.detail === "In 2 days")).toBe(true);
    expect(r.factors.some((f) => f.label === "Overdue work")).toBe(true);
  });
});
