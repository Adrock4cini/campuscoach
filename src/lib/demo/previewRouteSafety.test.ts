import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GUARDED_CONCEPT_ROUTES = [
  "/focus-sprint",
  "/assignments/:assignmentId",
  "/exams/:examId",
  "/notes/:noteId",
  "/progress",
  "/settings",
  "/exam-debrief",
  "/course-intelligence",
  "/your-week",
  "/path-to-graduation",
  "/scholarships",
];

describe("concept route preview safety", () => {
  it("keeps every unreleased interactive page inside the fail-closed boundary", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    for (const path of GUARDED_CONCEPT_ROUTES) {
      const start = source.indexOf(`<Route path="${path}"`);
      expect(start, `missing route ${path}`).toBeGreaterThanOrEqual(0);
      const nextRoute = source.indexOf("<Route path=", start + 1);
      const routeSource = source.slice(start, nextRoute < 0 ? undefined : nextRoute);
      expect(routeSource, `${path} must remain wrapped by DemoOnly`).toContain("<DemoOnly");
    }
  });
});
