import { describe, expect, it } from "vitest";
import { assignmentStatusLabel, materialSignal, testPrepSignal } from "./itemMaterials";

describe("materialSignal", () => {
  it("counts only material linked to the item itself", () => {
    expect(materialSignal(2, 9)).toMatchObject({ text: "2 materials", needsMaterial: false });
    expect(materialSignal(1, 0)).toMatchObject({ text: "1 material", needsMaterial: false });
  });

  it("does not claim item material when only class captures exist", () => {
    const signal = materialSignal(0, 4);
    expect(signal.text).toBe("Class material only");
    expect(signal.needsMaterial).toBe(true);
  });

  it("asks for material when nothing exists", () => {
    expect(materialSignal(0, 0)).toMatchObject({ text: "No material yet", tone: "warning", needsMaterial: true });
  });
});

describe("assignmentStatusLabel", () => {
  it("maps the schema statuses", () => {
    expect(assignmentStatusLabel("not_started")).toBe("Not started");
    expect(assignmentStatusLabel("in_progress")).toBe("In progress");
    expect(assignmentStatusLabel("complete")).toBe("Completed");
    expect(assignmentStatusLabel("bogus")).toBe("Not started");
  });
});

describe("testPrepSignal", () => {
  it("asks for material before scoring anything", () => {
    expect(testPrepSignal({ linkedCount: 0, classCount: 0, studySessions: 0, readiness: 80 })).toMatchObject({
      text: "Need more material",
      cta: "Add material",
    });
  });

  it("never claims studying without study-session evidence", () => {
    expect(testPrepSignal({ linkedCount: 3, classCount: 0, studySessions: 0, readiness: 70 })).toMatchObject({
      text: "Not studied yet",
      cta: "Prepare",
    });
  });

  it("uses the readiness word once real study evidence exists", () => {
    const signal = testPrepSignal({ linkedCount: 1, classCount: 0, studySessions: 2, readiness: 80 });
    expect(signal.cta).toBe("Continue studying");
    expect(signal.text).toBe("Strong");
    expect(signal.text).not.toMatch(/%/);
  });
});
