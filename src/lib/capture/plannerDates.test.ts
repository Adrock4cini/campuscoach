import { describe, expect, it } from "vitest";
import { extractPlannerDates, plannerDateWarnings, validPlannerDate, type PlannerSource } from "./plannerDates";

const source: PlannerSource = { id: "capture", client_class_id: "psych", class_id: "uuid", kind: "scan-material", topic: "PSYC deck · Slides 1–4", captured_on: "2026-09-09", processing_status: "ready", raw_text: null };
const extract = (raw_text: string) => extractPlannerDates({ ...source, raw_text });

describe("source-grounded planner proposals", () => {
  it("finds the daughter's assignment and quiz without creating planner items", () => {
    const rows = extract("PSYC 210 — Encoding, storage, retrieval, spacing effect\nAssignment due Fri Sep 12\nQuiz 1 Fri Sep 19");
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.kind, row.title, row.date])).toEqual([
      ["assignment", "Assignment", "2026-09-12"], ["exam", "Quiz 1", "2026-09-19"],
    ]);
    expect(rows[0].excerpt).toBe("Assignment due Fri Sep 12");
    expect(rows[0].warnings.join(" ")).toMatch(/Year missing/);
    expect(plannerDateWarnings(rows[0].excerpt, rows[0].date).join(" ")).toMatch(/weekday does not match/);
    expect(plannerDateWarnings(rows[0].excerpt, "2026-09-11")).toEqual([]);
  });
  it("accepts explicit ISO dates and full month names without timezone shifts", () => {
    expect(extract("Essay due 2027-01-04; Midterm on February 2, 2027").map(row => row.date)).toEqual(["2027-01-04", "2027-02-02"]);
    expect(extract("Quiz on September 19th, 2026")[0].warnings).toEqual([]);
  });
  it("uses a directly preceding heading but never crosses a blank boundary", () => {
    expect(extract("Quiz 1\nSeptember 19, 2026")[0]).toMatchObject({ kind: "exam", date: "2026-09-19", excerpt: "Quiz 1 — September 19, 2026" });
    expect(extract("Quiz 1\n\nSeptember 19, 2026")).toEqual([]);
  });
  it("does not guess numeric, relative, invalid, or multiple dates", () => {
    for (const text of ["Homework due 9/12/26", "Homework due next Friday", "Exam February 30, 2026", "Quiz moved from September 12 to September 19"]) {
      const [row] = extract(text);
      expect(row.date).toBe(""); expect(row.warnings.length).toBeGreaterThan(0);
    }
  });
  it("does not use a practice instruction as an actual test", () => {
    expect(extract("Prepare for quiz by September 19, 2026")[0].kind).toBe("assignment");
  });
  it("skips facts without work cues, cancellation, placeholders and failed wrong-class captures", () => {
    expect(extract("The author was born September 12, 1950.\nNo quiz on September 19, 2026.\nExam cancelled September 20, 2026")).toEqual([]);
    for (const processing_status of ["failed", "queued", "processing"]) expect(extractPlannerDates({ ...source, processing_status, raw_text: "Quiz Sep 12" })).toEqual([]);
    expect(extractPlannerDates({ ...source, kind: "scan-assignment", raw_text: "Quiz Sep 12" })).toEqual([]);
    expect(extractPlannerDates({ ...source, client_class_id: null, raw_text: "Quiz Sep 12" })).toEqual([]);
  });
  it("deduplicates repeated OCR lines and keeps per-capture identity stable", () => {
    const rows = extract("Quiz 1 Sep 12\nQuiz 1 Sep 12");
    expect(rows).toHaveLength(1);
    expect(extract("Unrelated header\nQuiz 1 Sep 12")[0].key).toBe(rows[0].key);
  });
  it("warns that precise times remain in notes", () => {
    expect(plannerDateWarnings("Essay due September 12 at 11:59 PM", "2026-09-12").join(" ")).toMatch(/date only/);
  });
  it("validates leap days and rejects Date's silent overflow", () => {
    expect(validPlannerDate("2028-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-13-01", "2026-01-32", "2026-1-2", "", "not a date"]) expect(validPlannerDate(date)).toBe(false);
  });
});
