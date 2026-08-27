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

  it("keeps prebuilt course foundations out of Recent and out of exam-window guessing", () => {
    const foundation = concept("course-map", {
      name: "Debit and credit",
      definition: "Asset increases use debits; liability increases use credits.",
      capture_id: null,
      source_kind: "course-map-stable",
      topic_aliases: ["debit", "credit", "account sides"],
      curriculum_order: 4,
      created_at: "2026-08-17T17:59:00.000Z",
    });

    expect(rankStudyConcepts([foundation], [], {
      scopeType: "recent",
      now: NOW,
      limit: 8,
    })).toEqual([]);
    expect(rankStudyConcepts([foundation], [], {
      scopeType: "exam",
      now: NOW,
      limit: 8,
      topics: ["inventory"],
      examDate: "2026-08-20",
      previousExamDate: "2026-08-01",
    })).toEqual([]);

    const matched = rankStudyConcepts([foundation], [], {
      scopeType: "exam",
      now: NOW,
      limit: 8,
      topics: ["debit"],
      examDate: "2026-08-20",
      previousExamDate: "2026-08-01",
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].evidence.map((item) => item.signal)).toContain("course_foundation");
    expect(matched[0].evidence.map((item) => item.signal)).not.toContain("exam_window");
    expect(matched[0].evidence.map((item) => item.signal)).not.toContain("recent");
  });

  it("does not topic-match a stable foundation through its broad definition", () => {
    const foundation = concept("unit-6", {
      name: "Adjusting entries",
      definition: "Accruals and deferrals change reported expenses and liabilities.",
      capture_id: null,
      source_kind: "course-map-stable",
      topic_aliases: ["adjusting entries", "accruals", "deferrals"],
      curriculum_order: 6,
    });

    expect(rankStudyConcepts([foundation], [], {
      scopeType: "exam",
      now: NOW,
      limit: 8,
      topics: ["liabilities"],
      examDate: "2026-08-20",
    })).toEqual([]);
    expect(rankStudyConcepts([foundation], [], {
      scopeType: "exam",
      now: NOW,
      limit: 8,
      topics: ["adjusting entries"],
      examDate: "2026-08-20",
    })).toHaveLength(1);
  });

  it("uses curriculum order to make equally weak course foundations predictable", () => {
    const ranked = rankStudyConcepts([
      concept("unit-4", { source_kind: "course-map-stable", curriculum_order: 4, capture_id: null }),
      concept("unit-1", { source_kind: "course-map-stable", curriculum_order: 1, capture_id: null }),
      concept("unit-2", { source_kind: "course-map-stable", curriculum_order: 2, capture_id: null }),
    ], [], { scopeType: "class", now: NOW, limit: 8 });

    expect(ranked.map((item) => item.concept.id)).toEqual(["unit-1", "unit-2", "unit-4"]);
  });

  it("lets a student's captured concept win a tie with a course foundation", () => {
    const ranked = rankStudyConcepts([
      concept("foundation", {
        name: "Adjusting entries",
        capture_id: null,
        source_kind: "course-map-stable",
        topic_aliases: ["adjusting entries"],
        curriculum_order: 6,
        created_at: NOW,
      }),
      concept("capture", {
        name: "Adjusting entries",
        capture_id: "capture-student",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ], [], {
      scopeType: "exam",
      now: NOW,
      limit: 8,
      topics: ["adjusting entries"],
    });

    expect(ranked.map((item) => item.concept.id)).toEqual(["capture", "foundation"]);
    expect(ranked[1].evidence).toContainEqual(expect.objectContaining({
      signal: "course_foundation",
      weight: 0,
    }));
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
