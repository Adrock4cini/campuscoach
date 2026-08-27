import { describe, expect, it } from "vitest";
import { buildAcct2010RuntimeMap } from "./acct-2010-runtime";
import {
  acct2010CourseMapSnapshot,
  canonicalizeAcct2010Concepts,
  serializeAcct2010ConceptSeeds,
  shouldActivateAcct2010Map,
} from "./acct-2010-generator";

const runtime = buildAcct2010RuntimeMap({ classCode: "ACCT 2010" })!;

describe("ACCT 2010 generate-artifact boundary", () => {
  it("activates only for class review or a named-topic exam", () => {
    expect(shouldActivateAcct2010Map({
      kind: "flashcards", hasExplicitCapture: false, scopeType: "class", examTopics: [],
    })).toBe(true);
    expect(shouldActivateAcct2010Map({
      kind: "matching", hasExplicitCapture: false, scopeType: "exam", examTopics: ["debits"],
    })).toBe(true);
    expect(shouldActivateAcct2010Map({
      kind: "practice", hasExplicitCapture: false, scopeType: "class", examTopics: [],
    })).toBe(false);
    expect(shouldActivateAcct2010Map({
      kind: "flashcards", hasExplicitCapture: true, scopeType: "class", examTopics: [],
    })).toBe(false);
    expect(shouldActivateAcct2010Map({
      kind: "flashcards", hasExplicitCapture: false, scopeType: "recent", examTopics: [],
    })).toBe(false);
    expect(shouldActivateAcct2010Map({
      kind: "flashcards", hasExplicitCapture: false, scopeType: "exam", examTopics: [],
    })).toBe(false);
  });

  it("serializes all 15 seeds without section, store, instructor, or publisher metadata", () => {
    const serialized = serializeAcct2010ConceptSeeds(runtime.conceptSeeds);
    expect(serialized).toHaveLength(15);
    expect(serialized[0]).toEqual(expect.objectContaining({
      identityKey: "course-map:acct-2010:v0:unit-01",
      examples: [],
      professorEmphasis: false,
      sourceKind: "course-map-stable",
      metadata: expect.objectContaining({ unitId: 1 }),
    }));
    expect(Object.keys(serialized[0].metadata).sort()).toEqual([
      "courseMapVersion", "topicAliases", "unitId",
    ]);
    expect(JSON.stringify(serialized)).not.toMatch(/isbn|publisher|instructor|store|section|platform/i);
  });

  it("canonicalizes stable rows from bundled copy and drops unknown reserved rows", () => {
    const canonical = canonicalizeAcct2010Concepts([
      {
        id: "stable",
        identity_key: "course-map:acct-2010:v0:unit-04",
        source_kind: "course-map-stable",
        name: "tampered",
        definition: "tampered",
        examples: ["tampered"],
        meta: { untrusted: true },
      },
      {
        id: "unknown",
        identity_key: "course-map:acct-2010:v0:unit-99",
        source_kind: "course-map-stable",
        name: "unknown",
      },
      { id: "ordinary", name: "Student capture", source_kind: "capture" },
    ], runtime);

    expect(canonical.map((concept) => concept.id)).toEqual(["stable", "ordinary"]);
    expect(canonical[0]).toEqual(expect.objectContaining({
      name: "Debit and credit",
      examples: [],
      curriculum_order: 4,
      topic_aliases: expect.arrayContaining(["Debit and credit"]),
    }));
    expect(canonical[0].definition).not.toBe("tampered");
  });

  it("applies professor exclusions only to the request and snapshots used units only", () => {
    const scoped = buildAcct2010RuntimeMap({
      classCode: "ACCT 2010",
      meta: {
        campusCompanion: {
          courseMaps: {
            "acct-2010:v0": {
              syllabusConfirmed: true,
              professorScope: {
                status: "confirmed",
                confirmationSource: "student-syllabus",
                excludedUnitIds: [14, 15],
              },
            },
          },
        },
      },
    })!;
    const rows = scoped.conceptSeeds.map((seed) => ({
      name: seed.name,
      identity_key: seed.identityKey,
      source_kind: seed.sourceKind,
    }));
    const canonical = canonicalizeAcct2010Concepts(rows, scoped);
    expect(scoped.conceptSeeds).toHaveLength(15);
    expect(canonical).toHaveLength(13);
    expect(acct2010CourseMapSnapshot(canonical.slice(0, 2), scoped)).toEqual({
      key: "acct-2010",
      version: "acct-2010-learning-map-v0",
      unitIds: [1, 2],
    });
  });
});
