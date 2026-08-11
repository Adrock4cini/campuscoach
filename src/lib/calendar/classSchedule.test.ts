import { describe, expect, it } from "vitest";
import {
  formatTimeKey,
  isDateWithinTerm,
  normalizeTimeKey,
  normalizeWeekdays,
} from "./classSchedule";

describe("class schedule normalization", () => {
  it("deduplicates and orders weekdays regardless of tap order", () => {
    expect(normalizeWeekdays(["Thu", "Mon", "Wed", "Mon", "invalid"])).toEqual([
      "Mon",
      "Wed",
      "Thu",
    ]);
  });

  it("normalizes common syllabus weekday names and combined labels", () => {
    expect(normalizeWeekdays(["Thursday", "Mon/Wed", "Tues."])).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
    ]);
    expect(normalizeWeekdays(["MWF", "TTh"])).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ]);
  });

  it("normalizes legacy and database time values", () => {
    expect(normalizeTimeKey("12:00 AM")).toBe("00:00");
    expect(normalizeTimeKey("12:00 PM")).toBe("12:00");
    expect(normalizeTimeKey("9:05 PM")).toBe("21:05");
    expect(normalizeTimeKey("09:05:00")).toBe("09:05");
    expect(formatTimeKey("21:05")).not.toBe("");
  });

  it("rejects malformed time values", () => {
    expect(normalizeTimeKey("24:00")).toBe("");
    expect(normalizeTimeKey("09:60")).toBe("");
    expect(normalizeTimeKey("whenever")).toBe("");
  });

  it("uses inclusive semester boundaries", () => {
    expect(isDateWithinTerm("2026-08-24", "2026-08-24", "2026-12-12")).toBe(true);
    expect(isDateWithinTerm("2026-12-12", "2026-08-24", "2026-12-12")).toBe(true);
    expect(isDateWithinTerm("2026-08-23", "2026-08-24", "2026-12-12")).toBe(false);
    expect(isDateWithinTerm("2026-12-13", "2026-08-24", "2026-12-12")).toBe(false);
  });
});
