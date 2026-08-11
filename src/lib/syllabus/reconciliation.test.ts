import { describe, expect, it } from "vitest";
import {
  buildStableSyllabusItemKeys,
  planSyllabusDeadlineReconciliation,
  type ExistingSyllabusDeadline,
} from "./reconciliation";

const existing = (patch: Partial<ExistingSyllabusDeadline> = {}): ExistingSyllabusDeadline => ({
  id: "deadline-1",
  classId: "class-1",
  source: "syllabus",
  externalId: "syllabus:class-1:assignment:assignment:aaaaaaaa:0",
  title: "Lab report",
  date: "2026-09-05",
  sourceTitle: "Lab report",
  sourceDate: "2026-09-05",
  archived: false,
  ...patch,
});

describe("syllabus deadline reconciliation", () => {
  it("never produces actions for manual, Canvas, or other-class rows", () => {
    const actions = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [
        existing({ id: "manual", source: "manual" }),
        existing({ id: "canvas", source: "canvas" }),
        existing({ id: "other", classId: "class-2" }),
      ],
      incoming: [],
    });
    expect(actions).toEqual([]);
  });

  it("updates the same row when a date changes, preserving its student state by identity", () => {
    const key = buildStableSyllabusItemKeys("assignment", [{ title: "Lab report", date: "old" }], (item) => item.title)[0].key;
    const actions = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [existing({ externalId: `syllabus:class-1:assignment:${key}` })],
      incoming: [{ key, title: "Lab report", date: "2026-09-12", included: true }],
    });
    expect(actions).toEqual([expect.objectContaining({ type: "update", id: "deadline-1" })]);
  });

  it("detaches a student-edited source row instead of overwriting it", () => {
    const actions = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [existing({ title: "My corrected lab title" })],
      incoming: [{ key: "assignment:bbbbbbbb:0", title: "Lab report", date: "2026-09-05", included: true }],
    });
    expect(actions.map((action) => action.type)).toEqual(["detach", "insert"]);
  });

  it("reactivates an untouched archived exact identity without guessing", () => {
    const key = "assignment:aaaaaaaa:0";
    const actions = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [existing({ archived: true, externalId: `syllabus:class-1:assignment:${key}` })],
      incoming: [{ key, title: "Lab report", date: "2026-09-05", included: true }],
    });
    expect(actions).toEqual([expect.objectContaining({ type: "update", id: "deadline-1" })]);
  });

  it("uses a unique legacy title match but never guesses between duplicate incoming titles", () => {
    const unique = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [existing({ externalId: "legacy:old" })],
      incoming: [{ key: "assignment:bbbbbbbb:0", title: " lab   report ", date: "2026-09-05", included: true }],
    });
    expect(unique[0]).toEqual(expect.objectContaining({ type: "update", id: "deadline-1" }));

    const duplicate = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [existing({ externalId: "legacy:old" })],
      incoming: [
        { key: "assignment:bbbbbbbb:0", title: "Lab report", date: "2026-09-05", included: true },
        { key: "assignment:bbbbbbbb:1", title: "Lab report", date: "2026-09-05", included: true },
      ],
    });
    expect(duplicate.filter((action) => action.type === "insert")).toHaveLength(2);
    expect(duplicate).toContainEqual({ type: "archive", id: "deadline-1" });
  });

  it("preserves duplicate legacy titles when their dates uniquely distinguish them", () => {
    const actions = planSyllabusDeadlineReconciliation({
      targetClassId: "class-1",
      kind: "assignment",
      existing: [
        existing({ id: "homework-1", externalId: "legacy:1", title: "Homework", sourceTitle: "Homework", date: "2026-09-05", sourceDate: "2026-09-05" }),
        existing({ id: "homework-2", externalId: "legacy:2", title: "Homework", sourceTitle: "Homework", date: "2026-09-12", sourceDate: "2026-09-12" }),
      ],
      incoming: [
        { key: "assignment:cccccccc:0", title: "Homework", date: "2026-09-05", included: true },
        { key: "assignment:cccccccc:1", title: "Homework", date: "2026-09-12", included: true },
      ],
    });
    expect(actions).toEqual([
      expect.objectContaining({ type: "update", id: "homework-1" }),
      expect.objectContaining({ type: "update", id: "homework-2" }),
    ]);
  });
});
