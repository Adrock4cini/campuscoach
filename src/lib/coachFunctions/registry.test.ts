/**
 * Coach Function Engine — behavior tests.
 *
 * Uses a minimal in-memory fake of the supabase client so functions
 * can be exercised end-to-end without network. Verifies the invariants
 * the acceptance criteria depend on.
 */
import { describe, expect, it, vi } from "vitest";
import { coachFunctionRegistry } from "./registry";
import type { CoachFunctionContext } from "./types";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  function makeBuilder(table: string) {
    const predicates: Array<(r: Row) => boolean> = [];
    const b = {
      select(_c?: string) { return b; },
      eq(k: string, v: unknown) { predicates.push((r) => r[k] === v); return b; },
      overlaps(k: string, v: unknown[]) {
        predicates.push((r) => {
          const arr = (r[k] as unknown[]) ?? [];
          return arr.some((x) => v.includes(x));
        });
        return b;
      },
      order() { return b; },
      limit() { return b; },
      async maybeSingle() {
        const rows = (tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));
        return { data: rows[0] ?? null, error: null };
      },
      then<T>(fn: (r: { data: Row[]; error: null }) => T) {
        const rows = (tables[table] ?? []).filter((r) => predicates.every((p) => p(r)));
        return Promise.resolve(fn({ data: rows, error: null }));
      },
    };
    return b;
  }
  return {
    from: (t: string) => makeBuilder(t),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  } as unknown as CoachFunctionContext["supabase"];
}

function ctx(supabase: CoachFunctionContext["supabase"], now = new Date("2026-07-13T12:00:00Z")): CoachFunctionContext {
  return { supabase, userId: "u1", now };
}

describe("coach function registry", () => {
  it("registers all 5 required functions", () => {
    const ids = coachFunctionRegistry.list().map((d) => d.id).sort();
    expect(ids).toEqual([
      "explain_concept",
      "prepare_for_exam",
      "study_weakest_topic",
      "what_am_i_forgetting",
      "what_should_i_do_now",
    ]);
  });

  it("returns error for unknown function ids", async () => {
    const r = await coachFunctionRegistry.run(
      "nope",
      {},
      ctx(fakeSupabase({})),
    );
    expect(r.status).toBe("error");
  });
});

describe("what_should_i_do_now", () => {
  const baseData = () => ({
    classes: [
      { user_id: "u1", client_class_id: "psych", name: "Psych" },
      { user_id: "u1", client_class_id: "bio", name: "Bio" },
    ],
    user_concept_mastery: [
      { user_id: "u1", concept_id: "p1", strength: 0.2, streak: 0, attempts: 2, last_seen_at: null, next_review_at: null,
        concepts: { name: "Neuron", client_class_id: "psych", professor_emphasis: true } },
      { user_id: "u1", concept_id: "b1", strength: 0.85, streak: 4, attempts: 5, last_seen_at: null, next_review_at: null,
        concepts: { name: "Mitochondria", client_class_id: "bio", professor_emphasis: false } },
    ],
    exams: [
      { user_id: "u1", id: "e1", client_class_id: "psych", title: "Midterm", exam_date: "2026-07-17", weight: 1 }, // 4d
      { user_id: "u1", id: "e2", client_class_id: "bio", title: "Final", exam_date: "2026-08-15", weight: 1 },     // far
    ],
    assignments: [],
    readiness_scores: [],
  });

  it("ranks imminent, weak-concept class first with structured evidence", async () => {
    const r = await coachFunctionRegistry.run("what_should_i_do_now", {}, ctx(fakeSupabase(baseData())));
    expect(r.status).toBe("ok");
    const p = r.payload as { classId: string; conceptIds: string[] };
    expect(p.classId).toBe("psych");
    expect(p.conceptIds).toContain("p1");
    expect(r.evidence.length).toBeGreaterThan(0);
    for (const e of r.evidence) {
      expect(typeof e.source).toBe("string");
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("after simulated mastery gain, weak class drops in urgency", async () => {
    const before = await coachFunctionRegistry.run("what_should_i_do_now", {}, ctx(fakeSupabase(baseData())));
    const beforeDelta = before.estimatedReadinessDelta ?? 0;

    const boosted = baseData();
    for (const m of boosted.user_concept_mastery) {
      if ((m.concepts as { client_class_id: string }).client_class_id === "psych") {
        (m as { strength: number }).strength = 0.9;
      }
    }
    const after = await coachFunctionRegistry.run("what_should_i_do_now", {}, ctx(fakeSupabase(boosted)));
    const afterDelta = after.estimatedReadinessDelta ?? 0;
    // Same-class urgency should decrease (weak concept resolved).
    expect(afterDelta).toBeLessThanOrEqual(beforeDelta);
  });

  it("emits capture recommendation when no concepts exist yet", async () => {
    const data = baseData();
    data.user_concept_mastery = [];
    const r = await coachFunctionRegistry.run("what_should_i_do_now", {}, ctx(fakeSupabase(data)));
    expect(r.status).toBe("ok");
    const actions = r.actions.map((a) => a.kind);
    expect(actions).toContain("capture");
  });
});

describe("what_am_i_forgetting", () => {
  it("ranks overdue concepts above non-overdue", async () => {
    const now = new Date("2026-07-13T12:00:00Z");
    const data = {
      classes: [{ user_id: "u1", client_class_id: "psych", name: "Psych" }],
      user_concept_mastery: [
        { user_id: "u1", concept_id: "a", strength: 0.6, streak: 1, attempts: 3, last_seen_at: null,
          next_review_at: "2026-07-10T12:00:00Z", // 3d overdue
          concepts: { name: "A", client_class_id: "psych", professor_emphasis: false } },
        { user_id: "u1", concept_id: "b", strength: 0.6, streak: 1, attempts: 3, last_seen_at: null,
          next_review_at: "2026-07-20T12:00:00Z", // future
          concepts: { name: "B", client_class_id: "psych", professor_emphasis: false } },
      ],
      exams: [],
      assignments: [],
      readiness_scores: [],
    };
    const r = await coachFunctionRegistry.run("what_am_i_forgetting", {}, ctx(fakeSupabase(data), now));
    const p = r.payload as { items: Array<{ conceptId: string; daysOverdue: number }> };
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.items[0].conceptId).toBe("a");
    expect(p.items[0].daysOverdue).toBeGreaterThan(0);
  });
});

describe("study_weakest_topic", () => {
  it("returns the weakest concepts as targets and evidence array", async () => {
    const data = {
      classes: [{ user_id: "u1", client_class_id: "psych", name: "Psych" }],
      user_concept_mastery: [
        { user_id: "u1", concept_id: "w", strength: 0.15, streak: 0, attempts: 1, last_seen_at: null, next_review_at: null,
          concepts: { name: "Weak", client_class_id: "psych", professor_emphasis: true } },
        { user_id: "u1", concept_id: "s", strength: 0.85, streak: 5, attempts: 5, last_seen_at: null, next_review_at: null,
          concepts: { name: "Strong", client_class_id: "psych", professor_emphasis: false } },
      ],
      exams: [],
      assignments: [],
      readiness_scores: [],
    };
    const r = await coachFunctionRegistry.run("study_weakest_topic", { classId: "psych" }, ctx(fakeSupabase(data)));
    expect(r.status).toBe("ok");
    const p = r.payload as { conceptIds: string[] };
    expect(p.conceptIds[0]).toBe("w");
    expect(r.evidence.length).toBeGreaterThan(0);
  });
});

describe("explain_concept", () => {
  it("loads concept from permanent memory before generating (concept-first)", async () => {
    const data = {
      concepts: [
        { id: "c1", user_id: "u1", name: "Neuron", definition: "cell", client_class_id: "psych", professor_emphasis: true },
      ],
      learning_artifacts: [],
    };
    const sup = fakeSupabase(data);
    const r = await coachFunctionRegistry.run("explain_concept", { conceptId: "c1", style: "simple" }, ctx(sup));
    // Either produced an artifact or gracefully reserved — but never "concept not found".
    expect(r.status === "ok" || r.status === "empty").toBe(true);
    const p = r.payload as { conceptName: string };
    expect(p.conceptName).toBe("Neuron");
  });

  it("errors when concept is missing (never invents memory)", async () => {
    const r = await coachFunctionRegistry.run("explain_concept", { conceptId: "missing", style: "simple" }, ctx(fakeSupabase({ concepts: [], learning_artifacts: [] })));
    expect(r.status).toBe("error");
  });
});
