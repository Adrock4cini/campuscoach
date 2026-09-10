import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmPlannerDate, loadPlannerDates } from "./plannerPersistence";

const mocks = vi.hoisted(() => ({ owner: "student", query: vi.fn() }));
vi.mock("@/hooks/useClassIntelligence", () => ({ getAuthenticatedUserId: () => mocks.owner }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: Record<string, unknown> = {};
  let payload: Record<string, unknown> | undefined;
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    in: (key: string, value: unknown) => { filters[key] = value; return query; },
    order: () => query, limit: () => query, maybeSingle: () => query,
    insert: (value: Record<string, unknown>) => { payload = value; return query; },
    then: (resolve: (value: unknown) => void) => Promise.resolve(mocks.query(table, filters, payload)).then(resolve),
  };
  return query;
} } }));
const source = { id: "capture", user_id: "student", client_class_id: "psych", class_id: "uuid", kind: "scan-material", topic: "Lecture.pptx · Slides 1–4", captured_on: "2026-09-09", processing_status: "ready", raw_text: "Assignment due September 12, 2026\nQuiz 1 September 19, 2026" };
let db: Record<string, Record<string, unknown>[]>;
let loseResponse: boolean;
let failReads: string | null;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto); mocks.owner = "student";
  db = { captures: [{ ...source }], assignments: [], exams: [] }; loseResponse = false; failReads = null;
  mocks.query.mockImplementation((table: string, filters: Record<string, unknown>, payload?: Record<string, unknown>) => {
    if (payload) {
      if (db[table].some(row => row.id === payload.id)) return { data: null, error: { code: "23505" } };
      db[table].push({ ...payload, source_archived_at: null });
      return loseResponse ? { data: null, error: new Error("Lost response") } : { data: { id: payload.id }, error: null };
    }
    if (failReads === table) return { data: null, error: new Error("Read unavailable") };
    return { data: db[table].filter(row => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)), error: null };
  });
});

describe("confirmed capture dates → existing planner", () => {
  it("only reads until confirmation, then persists assignment and exam in their correct class", async () => {
    const proposals = await loadPlannerDates("student", "psych");
    expect(proposals).toHaveLength(2);
    expect(db.assignments).toEqual([]); expect(db.exams).toEqual([]);
    const changed = vi.fn(); window.addEventListener("capture-planner:changed", changed);
    for (const proposal of proposals) await confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date });
    window.removeEventListener("capture-planner:changed", changed);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(db.assignments[0]).toMatchObject({ client_class_id: "psych", class_id: "uuid", due_date: "2026-09-12", status: "not_started", user_id: "student" });
    expect(db.exams[0]).toMatchObject({ exam_date: "2026-09-19", readiness: 0, topics: [] });
    expect(db.assignments[0].notes).toContain(source.topic);
    expect(db.assignments[0].notes).toContain("Assignment due September 12, 2026");
    expect(await loadPlannerDates("student", "psych")).toEqual([]);
    expect(new Set(mocks.query.mock.calls.map(call => call[0]))).toEqual(new Set(["captures", "assignments", "exams"]));
  });
  it("retries lost responses without duplicating or overwriting completed work", async () => {
    const [proposal] = await loadPlannerDates("student", "psych");
    loseResponse = true;
    await expect(confirmPlannerDate("student", proposal, { title: "Edited essay", date: "2026-09-14" })).resolves.toBe("added");
    db.assignments[0].status = "complete";
    await expect(confirmPlannerDate("student", proposal, { title: "Another title", date: "2026-09-15" })).resolves.toBe("existing");
    expect(db.assignments).toHaveLength(1);
    expect(db.assignments[0]).toMatchObject({ title: "Edited essay", due_date: "2026-09-14", status: "complete" });
    expect((await loadPlannerDates("student", "psych")).map(row => row.kind)).toEqual(["exam"]);
  });
  it("does not resurrect archived work", async () => {
    const [proposal] = await loadPlannerDates("student", "psych");
    await confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date });
    db.assignments[0].source_archived_at = "2026-09-10";
    expect((await loadPlannerDates("student", "psych")).map(row => row.kind)).toEqual(["exam"]);
  });
  it("recognizes matching manual/syllabus items without modifying them", async () => {
    const [proposal] = await loadPlannerDates("student", "psych");
    db.assignments.push({ id: "manual", user_id: "student", client_class_id: "psych", title: "Assignment", due_date: proposal.date, source_archived_at: null });
    await expect(confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date })).resolves.toBe("existing");
    expect(db.assignments).toHaveLength(1);
  });
  it("does not query for an empty capture selection", async () => {
    expect(await loadPlannerDates("student", "psych", [])).toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("blocks failed captures, another class, changed source, and account switches", async () => {
    const [proposal] = await loadPlannerDates("student", "psych");
    expect(await loadPlannerDates("student", "biology")).toEqual([]);
    db.captures[0].processing_status = "failed";
    await expect(confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date })).rejects.toThrow(/source changed/i);
    db.captures[0] = { ...source, raw_text: "Nothing is due" };
    await expect(confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date })).rejects.toThrow(/source changed/i);
    mocks.owner = "different-student";
    await expect(confirmPlannerDate("student", proposal, { title: proposal.title, date: proposal.date })).rejects.toThrow(/account changed/i);
    expect(db.assignments).toEqual([]);
  });
  it("fails closed if duplicate checking is unavailable, and can safely retry a partial batch", async () => {
    const proposals = await loadPlannerDates("student", "psych");
    await confirmPlannerDate("student", proposals[0], { title: proposals[0].title, date: proposals[0].date });
    failReads = "exams";
    await expect(confirmPlannerDate("student", proposals[1], { title: proposals[1].title, date: proposals[1].date })).rejects.toThrow(/duplicates/);
    expect(db.exams).toEqual([]); failReads = null;
    expect((await loadPlannerDates("student", "psych")).map(row => row.kind)).toEqual(["exam"]);
  });
  it("does not accept an invalid date or forged proposal id", async () => {
    const [proposal] = await loadPlannerDates("student", "psych");
    await expect(confirmPlannerDate("student", proposal, { title: proposal.title, date: "2026-02-30" })).rejects.toThrow(/valid date/);
    await expect(confirmPlannerDate("student", { ...proposal, plannerId: "forged" }, { title: proposal.title, date: proposal.date })).rejects.toThrow(/source changed/);
    expect(db.assignments).toEqual([]);
  });
});
