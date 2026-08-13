import { describe, expect, it } from "vitest";
import { buildDemoDashboardModel } from "./dashboardSampleAdapter";

describe("demo dashboard sample adapter", () => {
  it("keeps the sample semester current without changing the seeded source data", () => {
    const now = new Date("2030-09-10T08:00:00-06:00");
    const model = buildDemoDashboardModel(now);

    expect(model.classes).toHaveLength(4);
    expect(model.classes[0]).toMatchObject({
      id: "psych101",
      courseCode: "PSY 101",
      semesterStartDate: "2030-08-13",
      semesterEndDate: "2030-12-31",
    });
    expect(model.recommendations.length).toBeGreaterThan(0);
    expect(model.agenda.length).toBeGreaterThan(0);
    expect(model.agenda.every((item) => item.at >= now)).toBe(true);
    expect(model.agenda.every((item) => item.kind === "class")).toBe(true);
    const evidenceTypes = model.recommendations.flatMap((item) => item.evidence.map((evidence) => evidence.type));
    expect(evidenceTypes).not.toContain("assignment");
    expect(evidenceTypes).not.toContain("exam");
    expect(model.weakSpots).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Polynomial long division" }),
    ]));
  });

  it("produces the same sample model for the same date", () => {
    const now = new Date("2030-09-10T08:00:00-06:00");

    expect(buildDemoDashboardModel(now)).toEqual(buildDemoDashboardModel(now));
  });
});
