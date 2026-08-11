import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassSyllabusPage from "./ClassSyllabusPage";

const mocks = vi.hoisted(() => ({
  getClassSyllabus: vi.fn(),
  getClassSyllabusRequest: vi.fn(),
  parseClassSyllabus: vi.fn(),
  createSyllabusReviewDraft: vi.fn(),
  uploadSyllabusSource: vi.fn(),
  commitClassSyllabus: vi.fn(),
  createSignedSyllabusUrl: vi.fn(),
  deleteUncommittedSyllabusSource: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, isDemoMode: false }),
}));

vi.mock("@/lib/onboarding/useMyClasses", () => ({
  useMyClasses: () => ({
    classes: [{
      uuid: "class-uuid-1",
      id: "bio-101",
      name: "Biology 101",
      courseCode: "BIO 101",
      professor: "Dr. Chen",
      location: "Science 204",
      days: ["Mon", "Wed"],
      time: "9:30 AM",
      startTimeKey: "09:30",
      endTime: "10:45 AM",
      endTimeKey: "10:45",
      color: "bg-primary",
      currentTopic: "Cells",
      nextExamDate: "",
      readiness: 0,
      suggestedAction: "",
      gradingWeights: [],
      chapters: [],
      term: "Fall 2026",
      semesterStartDate: "2026-08-24",
      semesterEndDate: "2026-12-11",
      schedule: [],
    }],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/syllabus", () => ({
  MAX_SYLLABUS_BYTES: 15_000_000,
  SYLLABUS_MIME_TYPES: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  getClassSyllabus: mocks.getClassSyllabus,
  getClassSyllabusRequest: mocks.getClassSyllabusRequest,
  parseClassSyllabus: mocks.parseClassSyllabus,
  createSyllabusReviewDraft: mocks.createSyllabusReviewDraft,
  uploadSyllabusSource: mocks.uploadSyllabusSource,
  commitClassSyllabus: mocks.commitClassSyllabus,
  createSignedSyllabusUrl: mocks.createSignedSyllabusUrl,
  deleteUncommittedSyllabusSource: mocks.deleteUncommittedSyllabusSource,
}));

const validDraft = {
  selectedClassIndex: 0,
  sourceClassName: "Biology 101",
  sourceClassCode: "BIO 101",
  class: {
    weekdays: ["Mon", "Wed"],
    startTime: "09:30",
    endTime: "10:45",
    term: "Fall 2026",
    semesterStartDate: "2026-08-24",
    semesterEndDate: "2026-12-11",
  },
  assignments: [{ key: "assignment:12345678:0", included: true, title: "Cell lab", dueDate: "2026-09-04" }],
  exams: [{ key: "exam:12345678:0", included: true, title: "Midterm", examDate: "2026-10-12", topics: [] }],
  schedule: [{ key: "schedule:12345678:0", included: true, date: "2026-08-26", topic: "Cell structure", dueItems: [] }],
};

function parsed(...classes: Array<{ name: string; code?: string }>) {
  return {
    student: { term: "Fall 2026" },
    classes: classes.map((course) => ({
      ...course,
      days: [],
      assignments: [{ label: "Cell lab", dueDate: "2026-09-04" }],
      examDates: [{ label: "Midterm", date: "2026-10-12", topics: [] }],
      schedule: [],
    })),
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/classes/bio-101/syllabus"]}>
      <Routes>
        <Route path="/classes/:classId/syllabus" element={<ClassSyllabusPage />} />
        <Route path="/classes/:classId" element={<p data-testid="class-home">Class home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function choosePdf(name = "biology.pdf") {
  const file = new File(["syllabus"], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose a syllabus file"), { target: { files: [file] } });
  return file;
}

describe("ClassSyllabusPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getClassSyllabus.mockResolvedValue(null);
    mocks.getClassSyllabusRequest.mockResolvedValue(null);
    mocks.createSyllabusReviewDraft.mockReturnValue(validDraft);
    mocks.uploadSyllabusSource.mockImplementation(async ({ requestId }) => ({
      requestId,
      storagePath: `student-1/class-uuid-1/${requestId}/source.pdf`,
      originalName: "biology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      contentHash: "hash-1",
    }));
    mocks.commitClassSyllabus.mockResolvedValue({ status: "applied" });
    mocks.deleteUncommittedSyllabusSource.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");
  });

  it("requires an explicit detected-class choice when a file contains multiple classes", async () => {
    const result = parsed(
      { name: "Biology 101", code: "BIO 101" },
      { name: "Chemistry 101", code: "CHEM 101" },
    );
    mocks.parseClassSyllabus.mockResolvedValue(result);
    mocks.createSyllabusReviewDraft.mockImplementation((_parsed, index) => ({
      ...validDraft,
      selectedClassIndex: index,
      sourceClassName: result.classes[index].name,
      sourceClassCode: result.classes[index].code,
    }));

    renderPage();
    choosePdf("combined.pdf");

    const picker = await screen.findByRole("combobox", { name: /which part of the file/i });
    expect(screen.queryByRole("button", { name: "Save syllabus" })).not.toBeInTheDocument();
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole("option", { name: /Chemistry 101/ }));

    expect(await screen.findByText("Check that this is the right class")).toBeInTheDocument();
    expect(mocks.createSyllabusReviewDraft).toHaveBeenCalledWith(result, 1, expect.objectContaining({
      id: "class-uuid-1",
      clientClassId: "bio-101",
      name: "Biology 101",
    }));
  });

  it("retains corrected review fields after a save error", async () => {
    const result = parsed({ name: "Chemistry 101", code: "CHEM 101" });
    mocks.parseClassSyllabus.mockResolvedValue(result);
    mocks.commitClassSyllabus.mockRejectedValue(new Error("Temporary save failure"));

    renderPage();
    choosePdf();

    const confirmation = await screen.findByRole("checkbox", { name: /confirm this syllabus belongs to Biology 101/i });
    const assignmentName = screen.getByLabelText("Assignment name");
    fireEvent.change(assignmentName, { target: { value: "Cell membrane lab" } });
    fireEvent.click(confirmation);
    const saveButton = screen.getByRole("button", { name: "Save syllabus" });
    expect(confirmation).toBeChecked();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(mocks.commitClassSyllabus).toHaveBeenCalledTimes(1));

    expect(await screen.findByText(/couldn’t confirm whether the save finished/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cell membrane lab")).toBeInTheDocument();
    expect(mocks.commitClassSyllabus).toHaveBeenCalledWith(expect.objectContaining({
      classUuid: "class-uuid-1",
      clientClassId: "bio-101",
      review: expect.objectContaining({ assignments: [expect.objectContaining({ title: "Cell membrane lab" })] }),
    }));
    expect(mocks.deleteUncommittedSyllabusSource).not.toHaveBeenCalled();
    expect(screen.queryByTestId("class-home")).not.toBeInTheDocument();
  });

  it("confirms replacement before writing and returns to the exact class after success", async () => {
    mocks.getClassSyllabus.mockResolvedValue({
      id: "syllabus-1",
      storagePath: "student-1/class-uuid-1/old/source.pdf",
      originalName: "old-biology.pdf",
      updatedAt: "2026-08-09T12:00:00Z",
    });
    mocks.parseClassSyllabus.mockResolvedValue(parsed({ name: "Biology 101", code: "BIO 101" }));
    mocks.commitClassSyllabus.mockResolvedValue({
      syllabusId: "syllabus-1",
      revision: 1,
      noOp: true,
      retry: false,
      cleanupPath: "student-1/class-uuid-1/11111111-1111-4111-8111-111111111111/source.pdf",
    });
    const observedEvents: string[] = [];
    const eventNames = ["real-assignments:changed", "real-exams:changed", "coach:refresh"];
    const listeners = eventNames.map((name) => {
      const listener = () => observedEvents.push(name);
      window.addEventListener(name, listener);
      return [name, listener] as const;
    });

    renderPage();
    expect(await screen.findByText("old-biology.pdf")).toBeInTheDocument();
    choosePdf("new-biology.pdf");
    const replaceButton = await screen.findByRole("button", { name: "Review and replace" });
    await waitFor(() => expect(replaceButton).toBeEnabled());
    fireEvent.click(replaceButton);

    expect(screen.getByText(/Manual and Canvas deadlines/i)).toBeInTheDocument();
    expect(mocks.uploadSyllabusSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace this syllabus" }));

    expect(await screen.findByTestId("class-home")).toBeInTheDocument();
    await waitFor(() => expect(mocks.commitClassSyllabus).toHaveBeenCalledTimes(1));
    expect(mocks.deleteUncommittedSyllabusSource).toHaveBeenCalledWith(
      "student-1/class-uuid-1/11111111-1111-4111-8111-111111111111/source.pdf",
    );
    expect(observedEvents).toEqual(expect.arrayContaining(eventNames));
    listeners.forEach(([name, listener]) => window.removeEventListener(name, listener));
  });

  it("reuses the exact upload and request ID when commit status is ambiguous", async () => {
    mocks.getClassSyllabusRequest.mockRejectedValueOnce(new Error("lookup unavailable"));
    mocks.parseClassSyllabus.mockResolvedValue(parsed({ name: "Biology 101", code: "BIO 101" }));
    mocks.commitClassSyllabus
      .mockRejectedValueOnce(new Error("response dropped"))
      .mockResolvedValueOnce({ status: "applied" });

    renderPage();
    choosePdf();
    const saveButton = await screen.findByRole("button", { name: "Save syllabus" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    expect(await screen.findByText(/exact prior upload/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn’t confirm whether the save finished/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm save" }));

    expect(await screen.findByTestId("class-home")).toBeInTheDocument();
    expect(mocks.uploadSyllabusSource).toHaveBeenCalledTimes(1);
    expect(mocks.commitClassSyllabus).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.commitClassSyllabus.mock.calls.map(([input]) => input);
    expect(second.requestId).toBe(first.requestId);
    expect(second.source).toBe(first.source);
    expect(mocks.deleteUncommittedSyllabusSource).not.toHaveBeenCalled();
  });

  it("treats a request-ledger receipt as success after a dropped commit response", async () => {
    mocks.parseClassSyllabus.mockResolvedValue(parsed({ name: "Biology 101", code: "BIO 101" }));
    mocks.commitClassSyllabus.mockRejectedValueOnce(new Error("response dropped"));
    mocks.getClassSyllabusRequest.mockResolvedValueOnce({
      requestId: "11111111-1111-4111-8111-111111111111",
      classId: "class-uuid-1",
      result: {
        syllabusId: "22222222-2222-4222-8222-222222222222",
        revision: 1,
        noOp: true,
        retry: false,
        cleanupPath: "user-1/class-uuid-1/11111111-1111-4111-8111-111111111111/source.pdf",
      },
    });

    renderPage();
    choosePdf();
    const saveButton = await screen.findByRole("button", { name: "Save syllabus" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    expect(await screen.findByTestId("class-home")).toBeInTheDocument();
    expect(mocks.getClassSyllabusRequest).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(mocks.deleteUncommittedSyllabusSource).toHaveBeenCalledWith(
      "user-1/class-uuid-1/11111111-1111-4111-8111-111111111111/source.pdf",
    );
  });
});
