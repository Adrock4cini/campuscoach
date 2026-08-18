import { describe, expect, it } from "vitest";
import {
  rankStudyConcepts,
  resolveClassStudyScope,
  studySelectionSnapshot,
} from "./study-selection";

const NOW = "2026-08-17T18:00:00.000Z";

function concept(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Concept ${id}`,
    definition: `Definition for ${id}`,
    examples: [],
    professor_emphasis: false,
    capture_id: `capture-${id}`,
    created_at: "2026-08-01T18:00:00.000Z",
    ...overrides,
  };
}

describe("study concept selection", () => {
  it("preserves only a validated coach scope for an explicit concept handoff", () => {
    expect(resolveClassStudyScope("coach-k91z3", true)).toEqual({
      type: "class",
      id: "coach-k91z3",
      label: "Coach picks",
      topics: [],
    });
    expect(resolveClassStudyScope("coach-k91z3", false).id).toBe("class");
    expect(resolveClassStudyScope("coach-not_valid", true).id).toBe("class");
    expect(resolveClassStudyScope("arbitrary-scope", true).id).toBe("class");
  });

  it("prioritizes explicit exam evidence, due review, weak mastery, and teacher emphasis", () => {
    const ranked = rankStudyConcepts(
      [
        concept("linked", { professor_emphasis: true, created_at: "2026-08-16T18:00:00.000Z" }),
        concept("topic", { name: "Cell division through mitosis" }),
        concept("window"),
      ],
      [
        { concept_id: "linked", strength: 0.3, attempts: 4, correct: 1, next_review_at: "2026-08-16T00:00:00.000Z" },
        { concept_id: "topic", strength: 0.9, attempts: 4, correct: 4, next_review_at: "2026-08-20T00:00:00.000Z" },
      ],
      {
        scopeType: "exam",
        now: NOW,
        limit: 8,
        topics: ["mitosis"],
        examDate: "2026-08-20",
        previousExamDate: "2026-07-20",
        explicitExamCaptureIds: ["capture-linked"],
      },
    );

    expect(ranked.map((item) => item.concept.id)).toEqual(["linked", "topic", "window"]);
    expect(ranked[0].evidence.map((item) => item.signal)).toEqual(expect.arrayContaining([
      "explicit_exam_link",
      "review_due",
      "low_mastery",
      "teacher_emphasis",
      "recent",
    ]));
    expect(ranked[1].evidence.some((item) => item.signal === "exam_topic")).toBe(true);
    expect(ranked[2].evidence.some((item) => item.signal === "unseen")).toBe(true);
  });

  it("keeps direct concept and capture requests inside their exact selection", () => {
    const candidates = [concept("a"), concept("b"), concept("c")];
    const directConcept = rankStudyConcepts(candidates, [], {
      scopeType: "class",
      now: NOW,
      limit: 8,
      explicitConceptIds: ["b"],
    });
    const directCapture = rankStudyConcepts(candidates, [], {
      scopeType: "recent",
      now: NOW,
      limit: 8,
      explicitCaptureId: "capture-c",
    });

    expect(directConcept.map((item) => item.concept.id)).toEqual(["b"]);
    expect(directConcept[0].evidence[0].signal).toBe("explicit_concept");
    expect(directCapture.map((item) => item.concept.id)).toEqual(["c"]);
    expect(directCapture[0].evidence[0].signal).toBe("explicit_capture");
  });

  it("fails closed for exam concepts with no link, topic match, or exam window", () => {
    const ranked = rankStudyConcepts(
      [concept("old", { created_at: "2026-05-01T00:00:00.000Z" })],
      [],
      {
        scopeType: "exam",
        now: NOW,
        limit: 8,
        topics: ["photosynthesis"],
        previousExamDate: "2026-07-01",
        examDate: "2026-08-20",
      },
    );
    expect(ranked).toEqual([]);
  });

  it("uses a stable created-date then concept-id tie break", () => {
    const ranked = rankStudyConcepts(
      [concept("b"), concept("a"), concept("new", { created_at: "2026-08-02T18:00:00.000Z" })],
      [],
      { scopeType: "class", now: NOW, limit: 8 },
    );
    expect(ranked.map((item) => item.concept.id)).toEqual(["new", "a", "b"]);
  });

  it("stores transparent selection evidence without raw source text", () => {
    const ranked = rankStudyConcepts([concept("a")], [], {
      scopeType: "class",
      now: NOW,
      limit: 1,
    });
    expect(studySelectionSnapshot(ranked)).toEqual([expect.objectContaining({
      rank: 1,
      conceptId: "a",
      score: expect.any(Number),
      signals: expect.arrayContaining([expect.objectContaining({ signal: "unseen" })]),
    })]);
    expect(JSON.stringify(studySelectionSnapshot(ranked))).not.toContain("Definition for");
  });
});
