import { describe, expect, it } from "vitest";
import {
  canvasCompletion,
  canvasExternalId,
  htmlToPlainText,
  isCanvasExam,
  normalizeCanvasBaseUrl,
} from "./canvas-mapping";

describe("Canvas boundaries", () => {
  it("accepts only a secure institution root", () => {
    expect(normalizeCanvasBaseUrl("https://usu.instructure.com/courses/1"))
      .toBe("https://usu.instructure.com");
    expect(() => normalizeCanvasBaseUrl("http://usu.instructure.com")).toThrow();
    expect(() => normalizeCanvasBaseUrl("https://user:pass@example.com")).toThrow();
  });

  it("namespaces records by institution", () => {
    expect(canvasExternalId("https://usu.instructure.com", 42))
      .toBe("usu.instructure.com:42");
  });

  it("recognizes tests without turning final projects into exams", () => {
    expect(isCanvasExam({ id: 1, name: "Unit 3 Midterm" })).toBe(true);
    expect(isCanvasExam({ id: 2, name: "Final research project" })).toBe(false);
    expect(isCanvasExam({ id: 3, quiz_id: 7 })).toBe(true);
  });

  it("removes markup from Canvas descriptions", () => {
    expect(htmlToPlainText("<p>Solve <strong>all</strong>&nbsp;problems.</p>"))
      .toBe("Solve all problems.");
  });

  it("maps Canvas submission state into existing app statuses", () => {
    expect(canvasCompletion({ id: 1, submission: { workflow_state: "submitted" } }))
      .toBe("complete");
    expect(canvasCompletion({ id: 2, submission: { workflow_state: "unsubmitted" } }))
      .toBe("not_started");
  });
});
