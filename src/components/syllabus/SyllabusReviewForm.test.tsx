import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SyllabusReviewForm,
} from "./SyllabusReviewForm";
import { validateSyllabusReview } from "./reviewValidation";
import { createSyllabusReviewDraft, type SyllabusReviewDraft } from "@/lib/syllabus";

const parsedCourse = {
  name: "Biology 101",
  code: "BIO 101",
  days: ["Mon", "Wed"],
  time: "09:30 AM",
  endTime: "10:45 AM",
  semesterStartDate: "2026-08-24",
  semesterEndDate: "2026-12-11",
  assignments: [
    { label: "Cell lab", dueDate: "2026-09-04" },
    { label: "", dueDate: "" },
  ],
  examDates: [{ label: "Midterm", date: "2026-10-12", topics: [] }],
  schedule: [{ date: "2026-08-26", topic: "Cell structure", dueItems: ["Read chapter 2"] }],
};

describe("SyllabusReviewForm", () => {
  it("creates an editable review without changing the detected class identity", () => {
    const draft = createSyllabusReviewDraft({ student: { term: "Fall 2026" }, classes: [parsedCourse, parsedCourse, parsedCourse] }, 2);

    expect(draft.selectedClassIndex).toBe(2);
    expect(draft.sourceClassName).toBe("Biology 101");
    expect(draft.class.weekdays).toEqual(["Mon", "Wed"]);
    expect(draft.class.startTime).toBe("09:30");
    expect(draft.assignments[0]).toMatchObject({
      included: true,
      title: "Cell lab",
      dueDate: "2026-09-04",
    });
    expect(draft.schedule[0].dueItems).toEqual(["Read chapter 2"]);
  });

  it("blocks included rows with missing names or dates but allows the student to exclude them", () => {
    const draft = createSyllabusReviewDraft({ classes: [parsedCourse] });
    const invalid = validateSyllabusReview(draft);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[`assignment-${draft.assignments[1].key}-title`]).toMatch(/assignment name/i);
    expect(invalid.errors[`assignment-${draft.assignments[1].key}-date`]).toMatch(/due date/i);

    const excluded: SyllabusReviewDraft = {
      ...draft,
      assignments: draft.assignments.map((row, index) => index === 1 ? { ...row, included: false } : row),
    };
    expect(validateSyllabusReview(excluded).valid).toBe(true);
  });

  it("emits exact corrected titles and native date values", () => {
    let draft = createSyllabusReviewDraft({ classes: [parsedCourse] });
    const onChange = vi.fn((next: SyllabusReviewDraft) => {
      draft = next;
      rerender(<SyllabusReviewForm value={draft} onChange={onChange} />);
    });
    const { rerender } = render(<SyllabusReviewForm value={draft} onChange={onChange} />);

    fireEvent.change(screen.getAllByLabelText("Assignment name", { selector: "input" })[0], {
      target: { value: "Cell membrane lab" },
    });
    expect(draft.assignments[0].title).toBe("Cell membrane lab");

    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2026-10-14" },
    });
    expect(draft.exams[0].examDate).toBe("2026-10-14");
    expect(screen.getByLabelText("Exam date")).toHaveAttribute("type", "date");
  });

  it("announces invalid term order and disables excluded row fields", () => {
    const base = createSyllabusReviewDraft({ classes: [parsedCourse] });
    const draft: SyllabusReviewDraft = {
      ...base,
      class: {
        ...base.class,
        semesterStartDate: "2026-12-01",
        semesterEndDate: "2026-08-01",
      },
      assignments: base.assignments.map((row, index) => index === 0 ? { ...row, included: false } : row),
    };
    render(<SyllabusReviewForm value={draft} onChange={() => undefined} />);

    expect(screen.getByText(/end date must be after/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Assignment name", { selector: "input" })[0]).toBeDisabled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("preserves the target class schedule when parsing omits it and validates meetings", () => {
    const draft = createSyllabusReviewDraft(
      { classes: [{
        name: "Biology 101",
        code: "BIO 101",
        days: [],
        assignments: [],
        examDates: [],
        schedule: [],
      }] },
      0,
      {
        id: "class-uuid-1",
        clientClassId: "bio-101",
        name: "Biology 101",
        term: "Fall 2026",
        days: ["Thu", "Tue"],
        startTime: "14:00",
        endTime: "15:15",
        semesterStartDate: "2026-08-24",
        semesterEndDate: "2026-12-11",
      },
    );

    expect(draft).toMatchObject({
      class: {
        term: "Fall 2026",
        weekdays: ["Tue", "Thu"],
        startTime: "14:00",
        endTime: "15:15",
        semesterStartDate: "2026-08-24",
        semesterEndDate: "2026-12-11",
      },
    });
    expect(validateSyllabusReview(draft).valid).toBe(true);

    const invalid = validateSyllabusReview({ ...draft, class: { ...draft.class, endTime: "13:00" } });
    expect(invalid.errors["end-time"]).toMatch(/end after/i);
  });
});
