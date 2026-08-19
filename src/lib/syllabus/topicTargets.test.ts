import { describe, expect, it } from "vitest";
import { buildSyllabusTopicTargets } from "./topicTargets";

describe("syllabus topic targets", () => {
  it("surfaces stated exam topics before dated class-day topics", () => {
    const targets = buildSyllabusTopicTargets({
      today: "2026-09-01",
      exams: [{
        title: "Semester Final Exam",
        exam_date: "2026-12-10",
        topics: ["Cumulative: functions, systems, polynomials, exponentials/logs, sequences, probability, trigonometry"],
      }],
      schedule: [
        { date: "2026-09-04", topic: "Systems of equations" },
        { date: "2026-08-20", topic: "Course intro" },
      ],
    });

    expect(targets.slice(0, 7).map((t) => t.topic)).toEqual([
      "functions", "systems", "polynomials", "exponentials/logs", "sequences", "probability", "trigonometry",
    ]);
    expect(targets[0].source).toBe("exam");
    expect(targets.find((t) => t.topic === "Systems of equations")?.source).toBe("schedule");
    // Past class days stay available but never outrank what is still coming.
    expect(targets.at(-1)?.topic).toBe("Course intro");
  });

  it("invents nothing when a syllabus stated no topics", () => {
    expect(buildSyllabusTopicTargets({ exams: [{ title: "Quiz 1", exam_date: "2026-09-10", topics: [] }] }))
      .toEqual([]);
    expect(buildSyllabusTopicTargets({})).toEqual([]);
  });
});
