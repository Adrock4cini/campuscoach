import { describe, expect, it } from "vitest";
import type { ClassInfo } from "@/data/demo";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { buildClassAlerts, buildNextUpSummary, whenLabel } from "./classAlerts";

const NOW = new Date(2026, 7, 21); // Friday Aug 21 2026

function klass(id: string, name: string): ClassInfo {
  return {
    id, name, professor: "TBD", location: "", days: [], time: "", color: "bg-primary",
    currentTopic: "Getting started", nextExamDate: "", readiness: 0, suggestedAction: "",
    gradingWeights: [], chapters: [],
  } as ClassInfo;
}

function assignment(classId: string, due: string, extra: Partial<RealAssignment> = {}): RealAssignment {
  return {
    id: `a-${classId}-${due}`, user_id: "u", client_class_id: classId, class_id: null,
    title: "Problem set", due_date: due, estimated_minutes: 30, priority: "medium",
    status: "not_started", notes: null, created_at: "", updated_at: "", ...extra,
  };
}

function exam(classId: string, date: string, readiness: number): RealExam {
  return {
    id: `e-${classId}-${date}`, user_id: "u", client_class_id: classId, class_id: null,
    title: "Unit test", exam_date: date, topics: [], readiness, notes: null,
    created_at: "", updated_at: "",
  };
}

describe("whenLabel", () => {
  it("speaks in student time", () => {
    expect(whenLabel("2026-08-21", NOW)).toBe("today");
    expect(whenLabel("2026-08-22", NOW)).toBe("tomorrow");
    expect(whenLabel("2026-08-25", NOW)).toBe("Tue");
    expect(whenLabel("2026-09-02", NOW)).toBe("in 12d");
    expect(whenLabel("2026-08-18", NOW)).toBe("3d overdue");
  });
});

describe("buildClassAlerts", () => {
  const classes = [klass("math", "Math"), klass("bio", "Biology"), klass("eng", "English")];

  it("gives each class one headline with the right priority", () => {
    const alerts = buildClassAlerts(
      classes,
      [assignment("eng", "2026-08-21")],
      [exam("math", "2026-08-26", 0), exam("bio", "2026-08-28", 80)],
      NOW,
    );

    expect(alerts.math.text).toBe("Test Wed · Need more material");
    expect(alerts.bio.text).toBe("Test in 7d · Strong");
    expect(alerts.eng.text).toBe("Assignment due today");
    expect(alerts.eng.tone).toBe("warning");
  });

  it("prefers overdue work and adds only one tiny secondary indicator", () => {
    const alerts = buildClassAlerts(
      [klass("bio", "Biology")],
      [assignment("bio", "2026-08-19")],
      [exam("bio", "2026-08-25", 60)],
      NOW,
    );

    expect(alerts.bio.text).toBe("Assignment 2d overdue");
    expect(alerts.bio.tone).toBe("danger");
    expect(alerts.bio.secondary).toBe("+ test Tue");
  });

  it("stays silent for a class with no real work", () => {
    expect(buildClassAlerts([klass("hist", "History")], [], [], NOW).hist).toBeUndefined();
  });

  it("ignores completed assignments and past exams", () => {
    const alerts = buildClassAlerts(
      [klass("bio", "Biology")],
      [assignment("bio", "2026-08-22", { status: "complete" })],
      [exam("bio", "2026-08-01", 60)],
      NOW,
    );
    expect(alerts.bio).toBeUndefined();
  });
});

describe("buildNextUpSummary", () => {
  it("summarizes the next test and next due across classes", () => {
    const summary = buildNextUpSummary(
      [klass("math", "Math"), klass("bio", "Biology")],
      [assignment("bio", "2026-08-22"), assignment("math", "2026-08-24")],
      [exam("bio", "2026-08-28", 72), exam("math", "2026-09-02", 0)],
      NOW,
    );

    expect(summary.nextTest).toMatchObject({ className: "Biology", when: "in 7d", count: 2, insufficient: false });
    expect(summary.nextDue).toMatchObject({ className: "Biology", when: "tomorrow", count: 2, overdue: false });
  });

  it("is empty rather than invented when nothing is scheduled", () => {
    const summary = buildNextUpSummary([klass("math", "Math")], [], [], NOW);
    expect(summary.nextTest).toBeNull();
    expect(summary.nextDue).toBeNull();
  });
});
