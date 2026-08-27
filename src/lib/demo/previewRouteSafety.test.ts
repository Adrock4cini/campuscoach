import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GUARDED_CONCEPT_ROUTES = [
  "/focus-sprint",
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

const REAL_ONLY_ROUTES = [
  "/onboarding",
  "/classes/new",
  "/classes/:classId/edit",
  "/classes/:classId/syllabus",
  "/integrations/canvas",
];

describe("concept route preview safety", () => {
  it("serves real assignment details to signed-in students through a mode split", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const start = source.indexOf('<Route path="/assignments/:assignmentId"');
    expect(start).toBeGreaterThanOrEqual(0);
    const routeSource = source.slice(start, source.indexOf("<Route path=", start + 1));
    expect(routeSource).toContain("AssignmentDetailRoute");
    expect(routeSource).not.toContain("<DemoOnly");
  });

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

  it("keeps setup and account-connected routes out of sample mode", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    for (const path of REAL_ONLY_ROUTES) {
      const start = source.indexOf(`<Route path="${path}"`);
      expect(start, `missing route ${path}`).toBeGreaterThanOrEqual(0);
      const nextRoute = source.indexOf("<Route path=", start + 1);
      const routeSource = source.slice(start, nextRoute < 0 ? undefined : nextRoute);
      expect(routeSource, `${path} must remain wrapped by RealOnly`).toContain("<RealOnly>");
    }
  });

  it("keeps the Canvas route behind the fail-closed public feature gate", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const start = source.indexOf('<Route path="/integrations/canvas"');
    const nextRoute = source.indexOf("<Route path=", start + 1);
    const routeSource = source.slice(start, nextRoute);

    expect(routeSource).toContain("<CanvasConnectGate>");
    expect(routeSource).toContain("<RealOnly>");
  });
});
