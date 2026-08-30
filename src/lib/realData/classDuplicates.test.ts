import { describe, expect, it } from "vitest";
import {
  buildDuplicateLabels,
  classIdentityKey,
  isExactDuplicateClass,
} from "./classDuplicates";

describe("class duplicate diagnostics", () => {
  const items = [
    { id: "b", name: "QA — HVAC Cert", term: "Fall 2026", createdAt: "2026-08-22T05:55:00Z" },
    { id: "a", name: "qa — hvac cert ", term: "Fall 2026", createdAt: "2026-08-22T05:39:00Z" },
    { id: "c", name: "Biology 101", term: "Fall 2026", createdAt: "2026-08-22T03:53:00Z" },
    { id: "d", name: "BIOL 101", term: "Fall 2026", createdAt: "2026-08-22T04:00:00Z" },
  ];

  it("labels provably identical classes oldest-first and hides nothing", () => {
    const labels = buildDuplicateLabels(items);
    expect(labels.a.suffix).toBe("copy 1");
    expect(labels.b.suffix).toBe("copy 2");
    expect(Object.keys(labels)).toHaveLength(2);
  });

  it("never treats Biology 101 and BIOL 101 as the same class", () => {
    const labels = buildDuplicateLabels(items);
    expect(labels.c).toBeUndefined();
    expect(labels.d).toBeUndefined();
    expect(classIdentityKey(items[2])).not.toBe(classIdentityKey(items[3]));
  });

  it("blocks creating a new exact duplicate but allows a different section", () => {
    expect(isExactDuplicateClass({ name: "QA — HVAC Cert", term: "Fall 2026" }, items)).toBe(true);
    expect(
      isExactDuplicateClass({ name: "QA — HVAC Cert", term: "Fall 2026", section: "002" }, items),
    ).toBe(false);
    expect(isExactDuplicateClass({ name: "New Class", term: "Fall 2026" }, items)).toBe(false);
  });

  it("ignores the row being edited", () => {
    expect(isExactDuplicateClass({ name: "Biology 101", term: "Fall 2026" }, items, "c")).toBe(false);
  });
});
