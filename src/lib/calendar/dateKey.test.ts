import { describe, expect, it } from "vitest";
import {
  formatDateKey,
  isDateKey,
  isPastDateKey,
  parseDateKey,
  todayDateKey,
  toDateKey,
} from "./dateKey";

describe("local calendar date keys", () => {
  it("keeps a Mountain Time evening on the student's local day", () => {
    const evening = new Date(2026, 7, 9, 20, 30);
    expect(todayDateKey(evening)).toBe("2026-08-09");
    expect(toDateKey(evening)).toBe("2026-08-09");
  });

  it("parses valid dates from local calendar parts", () => {
    const leapDay = parseDateKey("2028-02-29");
    expect(leapDay?.getFullYear()).toBe(2028);
    expect(leapDay?.getMonth()).toBe(1);
    expect(leapDay?.getDate()).toBe(29);
  });

  it("rejects invalid or rolled-over dates", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("08/09/2026")).toBe(false);
  });

  it("formats without shifting the calendar day", () => {
    expect(formatDateKey("2026-08-09", { month: "long", day: "numeric" })).toBe("August 9");
  });

  it("treats today as current through the end of the student's local day", () => {
    const lateEvening = new Date(2026, 7, 17, 23, 59);

    expect(isPastDateKey("2026-08-16", lateEvening)).toBe(true);
    expect(isPastDateKey("2026-08-17", lateEvening)).toBe(false);
    expect(isPastDateKey("2026-08-18", lateEvening)).toBe(false);
    expect(isPastDateKey(null, lateEvening)).toBe(false);
  });
});
