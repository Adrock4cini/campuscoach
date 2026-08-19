import { describe, expect, it } from "vitest";
import {
  captureContextLabel,
  classesMeetingNow,
  inferCaptureClass,
  type CaptureClassCandidate,
} from "./captureContextInference";

const math: CaptureClassCandidate = {
  id: "math",
  name: "Math",
  days: ["mon", "wed"],
  startTimeKey: "09:00",
  endTimeKey: "10:00",
};

const science: CaptureClassCandidate = {
  id: "science",
  name: "Science",
  days: ["mon"],
  startTimeKey: "09:30",
  endTimeKey: "11:00",
};

// Monday 2026-08-17, 09:15 local time.
const mondayMorning = new Date(2026, 7, 17, 9, 15);

describe("inferCaptureClass", () => {
  it("uses the explicit entry class before anything else", () => {
    const result = inferCaptureClass({
      entryClassId: "science",
      rememberedClassId: "math",
      classes: [math, science],
      now: mondayMorning,
    });
    expect(result).toMatchObject({ classId: "science", source: "entry", needsClass: false });
  });

  it("reuses the remembered class so a repeat capture asks nothing", () => {
    const result = inferCaptureClass({
      rememberedClassId: "math",
      classes: [math, science],
      now: mondayMorning,
    });
    expect(result).toMatchObject({ classId: "math", source: "remembered", needsClass: false });
  });

  it("ignores a remembered class the student no longer has", () => {
    const result = inferCaptureClass({
      rememberedClassId: "dropped",
      classes: [math, science],
      now: new Date(2026, 7, 18, 14, 0),
    });
    expect(result).toMatchObject({ classId: "", source: "none", needsClass: true });
  });

  it("suggests the single class meeting right now at medium confidence", () => {
    const result = inferCaptureClass({
      classes: [math, science],
      now: mondayMorning,
    });
    expect(result).toMatchObject({ classId: "math", source: "schedule", confidence: "medium" });
  });

  it("asks instead of guessing when two class windows overlap", () => {
    const result = inferCaptureClass({
      classes: [math, science],
      now: new Date(2026, 7, 17, 9, 45),
    });
    expect(result.needsClass).toBe(true);
    expect(result.classId).toBe("");
  });

  it("never auto-assigns the first of several classes without evidence", () => {
    const result = inferCaptureClass({
      classes: [math, science],
      now: new Date(2026, 7, 19, 22, 0),
    });
    expect(result).toMatchObject({ classId: "", source: "none", needsClass: true });
  });

  it("uses the student's only class", () => {
    const result = inferCaptureClass({
      classes: [{ id: "solo", name: "Solo" }],
      now: mondayMorning,
    });
    expect(result).toMatchObject({ classId: "solo", source: "only-class", needsClass: false });
  });
});

describe("classesMeetingNow", () => {
  it("skips classes without both schedule edges", () => {
    expect(
      classesMeetingNow([{ id: "vague", days: ["mon"], startTimeKey: "09:00" }], mondayMorning),
    ).toEqual([]);
  });

  it("skips classes outside their term dates", () => {
    expect(
      classesMeetingNow(
        [{ ...math, semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-15" }],
        mondayMorning,
      ),
    ).toEqual([]);
  });
});

describe("captureContextLabel", () => {
  it("reads as a chip, not a form", () => {
    expect(
      captureContextLabel({ className: "Math", dateKey: "2026-08-17", todayKey: "2026-08-17" }),
    ).toBe("Math · today");
    expect(
      captureContextLabel({
        className: "Math",
        dateKey: "2026-08-16",
        todayKey: "2026-08-17",
        topic: "Limits",
      }),
    ).toBe("Math · 2026-08-16 · Limits");
  });
});
