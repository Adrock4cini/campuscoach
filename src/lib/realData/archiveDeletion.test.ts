import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.each(["assignments", "exams"])("%s student deletion", (resource) => {
  it("archives the parent instead of severing linked capture provenance", () => {
    const source = readFileSync(resolve(
      process.cwd(),
      `src/lib/realData/${resource}.ts`,
    ), "utf8");
    const functionName = resource === "assignments" ? "deleteAssignment" : "deleteExam";
    const start = source.indexOf(`export async function ${functionName}`);
    const body = source.slice(start);

    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('.update({ source_archived_at: new Date().toISOString() })');
    expect(body).not.toContain('.from("assignments").delete()');
    expect(body).not.toContain('.from("exams").delete()');
  });
});
