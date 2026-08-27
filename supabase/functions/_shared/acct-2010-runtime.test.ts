import { describe, expect, it } from "vitest";
import {
  ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS,
  ACCT_2010_META_NAMESPACE,
  buildAcct2010RuntimeMap,
  isAcct2010Class,
  normalizeAcct2010Section,
  parseAcct2010ClassMeta,
  resolveAcct2010Fall2026Overlay,
} from "./acct-2010-runtime";

function namespacedMeta(value: Record<string, unknown>) {
  return {
    campusCompanion: {
      courseMaps: {
        [ACCT_2010_META_NAMESPACE]: value,
      },
    },
  };
}

describe("ACCT 2010 runtime adapter", () => {
  it.each([
    { classCode: "ACCT 2010" },
    { classCode: "acct-2010" },
    { className: "ACCT2010 — Financial Accounting" },
    { className: "Fall ACCT 2010 (section 002)" },
  ])("recognizes the literal ACCT 2010 identifier %#", (input) => {
    expect(isAcct2010Class(input)).toBe(true);
  });

  it.each([
    { classCode: "ACCT 2020" },
    { classCode: "ECON 2010" },
    { className: "Accounting 2010" },
    { className: "ACCT 20101" },
    { className: "ACCT 2010A" },
    { className: "Introduction to Accounting" },
  ])("does not broaden recognition to a neighboring course or title %#", (input) => {
    expect(isAcct2010Class(input)).toBe(false);
    expect(buildAcct2010RuntimeMap(input)).toBeNull();
  });

  it("normalizes only the known numeric and branch section shapes", () => {
    expect(normalizeAcct2010Section("2")).toBe("002");
    expect(normalizeAcct2010Section(" 02 ")).toBe("002");
    expect(normalizeAcct2010Section("Section 011")).toBe("011");
    expect(normalizeAcct2010Section("ab1")).toBe("AB1");
    expect(normalizeAcct2010Section("IO1")).toBe("IO1");
    expect(normalizeAcct2010Section("000")).toBeNull();
    expect(normalizeAcct2010Section("A1")).toBeNull();
    expect(normalizeAcct2010Section("002-extra")).toBeNull();
    expect(normalizeAcct2010Section("   ")).toBeNull();
  });

  it("resolves store metadata only for exact Fall 2026 plus a known section", () => {
    expect(resolveAcct2010Fall2026Overlay({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "2",
    })).toMatchObject({ sectionId: "002", crn: "40016", instructor: "Erickson, Devon" });

    expect(resolveAcct2010Fall2026Overlay({
      classCode: "ACCT 2010",
      term: "fall 2026",
      section: "002",
    })).toBeNull();
    expect(resolveAcct2010Fall2026Overlay({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "010",
    })).toBeNull();
    expect(resolveAcct2010Fall2026Overlay({
      classCode: "ACCT 2020",
      term: "Fall 2026",
      section: "002",
    })).toBeNull();
  });

  it("ignores professor scope outside the narrow namespace", () => {
    expect(parseAcct2010ClassMeta({
      professorScope: {
        status: "confirmed",
        confirmationSource: "student-syllabus",
        excludedUnitIds: [14, 15],
      },
      syllabusConfirmed: true,
    })).toEqual({
      syllabusConfirmed: false,
      professorScope: { status: "unconfirmed", excludedUnitIds: [] },
    });
  });

  it("parses explicit confirmation and rejects an invalid exclusion atomically", () => {
    expect(parseAcct2010ClassMeta(namespacedMeta({
      syllabusConfirmed: true,
      professorScope: {
        status: "confirmed",
        confirmationSource: "student-syllabus",
        excludedUnitIds: [15, 14, 15],
      },
    }))).toEqual({
      syllabusConfirmed: true,
      professorScope: {
        status: "confirmed",
        confirmationSource: "student-syllabus",
        excludedUnitIds: [14, 15],
      },
    });

    expect(parseAcct2010ClassMeta(namespacedMeta({
      syllabusConfirmed: true,
      professorScope: {
        status: "confirmed",
        confirmationSource: "student-syllabus",
        excludedUnitIds: [13, 14],
      },
    }))).toEqual({
      syllabusConfirmed: true,
      professorScope: { status: "unconfirmed", excludedUnitIds: [] },
    });
  });

  it("returns stable concepts but no homework-shaped examples without section or syllabus", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "",
    });

    expect(runtime).not.toBeNull();
    expect(runtime?.diagnosticsEnabled).toBe(false);
    expect(runtime?.diagnosticByIdentityKey).toEqual({});
    expect(runtime?.fall2026StoreOverlay).toBeNull();
    expect(runtime?.activeUnitIds).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(runtime?.conceptSeeds).toHaveLength(15);
    expect(runtime?.conceptSeeds.every((seed) => seed.examples.length === 0)).toBe(true);
  });

  it("allows request-local diagnostics for an exact known overlay while seeds stay stable", () => {
    const runtime = buildAcct2010RuntimeMap({
      className: "ACCT 2010",
      term: "Fall 2026",
      section: "003",
    });

    expect(runtime?.normalizedSection).toBe("003");
    expect(runtime?.diagnosticsEnabled).toBe(true);
    expect(runtime?.fall2026StoreOverlay).toMatchObject({
      crn: "40015",
      instructor: "Shuai",
      materialIds: ["examind", "connect"],
    });
    expect(Object.keys(runtime?.diagnosticByIdentityKey ?? {})).toHaveLength(15);
    expect(runtime?.diagnosticByIdentityKey["course-map:acct-2010:v0:unit-01"])
      .toContain("$18,000");
    expect(runtime?.conceptSeeds).toHaveLength(15);
    expect(runtime?.conceptSeeds.every((seed) => seed.examples.length === 0)).toBe(true);
  });

  it("does not enable diagnostics for a merely well-shaped unknown section", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "010",
    });

    expect(runtime?.normalizedSection).toBe("010");
    expect(runtime?.fall2026StoreOverlay).toBeNull();
    expect(runtime?.diagnosticsEnabled).toBe(false);
    expect(runtime?.diagnosticByIdentityKey).toEqual({});
    expect(runtime?.conceptSeeds).toHaveLength(15);
  });

  it("does not enable diagnostics for a known section outside the exact researched term", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Spring 2027",
      section: "002",
    });

    expect(runtime?.normalizedSection).toBe("002");
    expect(runtime?.fall2026StoreOverlay).toBeNull();
    expect(runtime?.diagnosticsEnabled).toBe(false);
    expect(runtime?.diagnosticByIdentityKey).toEqual({});
  });

  it("keeps all stable seeds but request-locally filters confirmed 14–15 scope", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Spring 2027",
      meta: namespacedMeta({
        syllabusConfirmed: true,
        professorScope: {
          status: "confirmed",
          confirmationSource: "student-syllabus",
          excludedUnitIds: [14, 15],
        },
      }),
    });

    expect(runtime?.diagnosticsEnabled).toBe(true);
    expect(runtime?.fall2026StoreOverlay).toBeNull();
    expect(runtime?.activeUnitIds).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    expect(runtime?.conceptSeeds.map((seed) => seed.metadata.unitId)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    expect(runtime?.conceptSeeds.every((seed) => seed.examples.length === 0)).toBe(true);
    expect(Object.keys(runtime?.diagnosticByIdentityKey ?? {})).toHaveLength(13);
    expect(runtime?.diagnosticByIdentityKey).not.toHaveProperty(
      "course-map:acct-2010:v0:unit-14",
    );
    expect(runtime?.diagnosticByIdentityKey).not.toHaveProperty(
      "course-map:acct-2010:v0:unit-15",
    );
  });

  it("builds deterministic identities with stable-only persistence metadata", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "AB1",
    });
    const first = runtime?.conceptSeeds[0];
    const fourth = runtime?.conceptSeeds[3];

    expect(runtime?.conceptSeeds.map((seed) => seed.identityKey)).toEqual(
      Array.from({ length: 15 }, (_, index) => (
        `course-map:acct-2010:v0:unit-${String(index + 1).padStart(2, "0")}`
      )),
    );
    expect(first?.definition).toContain("Assets = liabilities + equity");
    expect(first?.definition).toContain("Equity is the owners' claim");
    expect(fourth?.definition).toContain("Asset increases use debits");
    expect(fourth?.definition).toContain("Debit and credit name the left and right sides");
    expect(first?.metadata).toEqual({
      courseMapVersion: "acct-2010-learning-map-v0",
      unitId: 1,
      topicAliases: [
        "Accounting equation",
        "Assets = liabilities + equity",
        "Classify one event's effect on the equation",
      ],
    });
    expect(Object.keys(first?.metadata ?? {})).toEqual([
      "courseMapVersion", "unitId", "topicAliases",
    ]);
    expect(first?.examples).toEqual([]);
  });

  it("exposes diagnostics only for ordinary deterministic study formats", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "002",
    });

    expect(ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS).toEqual([
      "flashcards", "multiple_choice", "matching",
    ]);
    expect(runtime?.diagnosticArtifactKinds).toEqual(
      ACCT_2010_DIAGNOSTIC_ARTIFACT_KINDS,
    );
    expect(runtime?.diagnosticArtifactKinds).not.toContain("practice");
  });

  it("does not put publisher labels, identifiers, or prose into concept seeds", () => {
    const runtime = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      term: "Fall 2026",
      section: "003",
    });
    const seeds = JSON.stringify(runtime?.conceptSeeds);
    for (const forbidden of [
      "Phillips", "McGraw", "Connect", "EXAMIND", "Utah State University",
      "Fall 2026", "Hunt, Rhett", "Shuai", "9781265052362",
      "9781265560072", "2810000065613",
    ]) expect(seeds).not.toContain(forbidden);
  });
});
