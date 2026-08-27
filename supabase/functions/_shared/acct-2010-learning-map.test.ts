import { describe, expect, it } from "vitest";
import {
  ACCT_2010_FALL_2026_SECTIONS,
  ACCT_2010_LEARNING_MAP_V0,
  ACCT_2010_MATERIALS,
  ACCT_2010_STABLE_UNITS,
  acct2010SectionOverlay,
  unitsForConfirmedProfessorScope,
} from "./acct-2010-learning-map";

describe("ACCT 2010 Learning Map v0", () => {
  it("keeps the 15-unit stable map complete, ordered, and teachable", () => {
    expect(ACCT_2010_STABLE_UNITS.map((unit) => unit.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    for (const unit of ACCT_2010_STABLE_UNITS) {
      expect(unit.title.trim()).not.toBe("");
      expect(unit.focus.length).toBeGreaterThan(0);
      expect(unit.misconception.lure.trim()).not.toBe("");
      expect(unit.misconception.correction.trim()).not.toBe("");
      expect(unit.teachingPlan.length).toBeGreaterThan(0);
      expect(unit.diagnosticStem.trim()).not.toBe("");
    }
  });

  it("stores only original teaching copy in the stable layer", () => {
    const stable = JSON.stringify(ACCT_2010_LEARNING_MAP_V0.stable);
    for (const forbidden of ["Phillips", "McGraw", "Connect", "EXAMIND", "OpenStax"]) {
      expect(stable).not.toContain(forbidden);
    }
    expect(ACCT_2010_LEARNING_MAP_V0.stable.contentPolicy).toBe(
      "original-teaching-copy-only",
    );
  });

  it("does not turn a program reference into a fake course objective", () => {
    expect(ACCT_2010_LEARNING_MAP_V0.usu.programGoalReferences).toEqual([
      { code: "AoL L1.1", level: "program", wording: null },
    ]);
    expect(ACCT_2010_LEARNING_MAP_V0.usu.courseLearningObjectives).toEqual({
      status: "unknown",
      items: [],
    });
    expect(ACCT_2010_LEARNING_MAP_V0.usu.progressionRequirement.minimumGrade).toBe("B");
  });

  it("preserves all 19 exact Fall 2026 section rows", () => {
    expect(ACCT_2010_FALL_2026_SECTIONS).toHaveLength(19);
    expect(new Set(ACCT_2010_FALL_2026_SECTIONS.map((row) => row.sectionId)).size).toBe(19);
    expect(new Set(ACCT_2010_FALL_2026_SECTIONS.map((row) => row.crn)).size).toBe(19);
    expect(ACCT_2010_FALL_2026_SECTIONS.map(({ sectionId, crn }) => [sectionId, crn])).toEqual([
      ["002", "40016"], ["003", "40015"], ["004", "42109"], ["005", "40021"],
      ["006", "42110"], ["007", "40019"], ["008", "40020"], ["009", "40018"],
      ["011", "47792"], ["AB1", "48146"], ["BB1", "48147"], ["CB1", "49362"],
      ["EB1", "49363"], ["KB1", "48148"], ["MB1", "48006"], ["PB1", "49365"],
      ["TB1", "49368"], ["UB1", "43501"], ["IO1", "43285"],
    ]);
  });

  it("keeps ISBNs and the EXAMIND barcode correctly typed as metadata", () => {
    expect(ACCT_2010_MATERIALS.ebook.identifiers).toEqual([
      { scheme: "ISBN-13", value: "9781265052362" },
    ]);
    expect(ACCT_2010_MATERIALS.connect.identifiers).toEqual([
      { scheme: "ISBN-13", value: "9781265560072" },
    ]);
    expect(ACCT_2010_MATERIALS.examind.identifiers).toEqual([
      { scheme: "BARCODE", value: "2810000065613" },
    ]);
    for (const material of Object.values(ACCT_2010_MATERIALS)) {
      expect(material.usePolicy).toBe("metadata-only-do-not-ingest");
    }
  });

  it("maps the known section-specific material combinations exactly", () => {
    expect(acct2010SectionOverlay("002")).toMatchObject({
      instructor: "Erickson, Devon",
      materialIds: ["examind"],
    });
    expect(acct2010SectionOverlay("003")?.materialIds).toEqual(["examind", "connect"]);
    expect(acct2010SectionOverlay("004")?.materialIds).toEqual(["examind", "ebook"]);
    expect(acct2010SectionOverlay("006")?.materialIds).toEqual(["ebook", "examind"]);
    expect(acct2010SectionOverlay("009")?.materialIds).toEqual(["ebook"]);
    expect(acct2010SectionOverlay("IO1")).toMatchObject({
      instructor: "Wilkey, Lacee",
      materialIds: ["examind"],
    });
    const hunt = ACCT_2010_FALL_2026_SECTIONS.filter(
      (row) => row.instructor === "Hunt, Rhett",
    );
    expect(hunt).toHaveLength(9);
    expect(hunt.every((row) => JSON.stringify(row.materialIds) === '["ebook"]')).toBe(true);
  });

  it("never drops units from unconfirmed store metadata", () => {
    for (const section of ACCT_2010_FALL_2026_SECTIONS) {
      expect(section.professorScope).toEqual({ status: "unconfirmed", excludedUnitIds: [] });
      expect(unitsForConfirmedProfessorScope(section.professorScope)).toHaveLength(15);
    }
  });

  it("allows only an explicit confirmation to exclude units 14 or 15", () => {
    expect(unitsForConfirmedProfessorScope({
      status: "confirmed",
      confirmationSource: "student-syllabus",
      excludedUnitIds: [14, 15],
    }).map((unit) => unit.id)).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));

    expect(() => unitsForConfirmedProfessorScope({
      status: "confirmed",
      confirmationSource: "student-confirmation",
      // Exercise the runtime fail-closed guard against untyped input.
      excludedUnitIds: [13] as unknown as readonly (14 | 15)[],
    })).toThrow(/Only units 14 and 15/);
  });

  it("marks the OER finding as limited to the fetched rows", () => {
    expect(ACCT_2010_LEARNING_MAP_V0.professor.oerStatus).toBe(
      "none-in-fetched-store-rows",
    );
  });
});
