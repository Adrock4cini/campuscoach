import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PdfStudyImportDialog from "./PdfStudyImportDialog";
import { readPdfCheckpoint } from "@/lib/capture/pdfImport";

const mocks = vi.hoisted(() => ({ owner: "owner", slides: false, hash: "a".repeat(64), commit: vi.fn(), retry: vi.fn(), render: vi.fn(), destroy: vi.fn(), close: vi.fn() }));
vi.mock("@/lib/onboarding/useMyClasses", () => ({ useMyClasses: () => ({ classes: [{ id: "drivers", name: "Driver education" }, { id: "bio", name: "BIOL" }], loading: false, error: null, reload: vi.fn() }) }));
vi.mock("@/lib/realData/hooks", () => ({ useRealExams: () => ({ items: [{ id: "exam", client_class_id: "drivers", title: "Permit retest", exam_date: "2099-01-01" }], loading: false, error: null }) }));
vi.mock("@/hooks/useClassIntelligence", () => ({ getAuthenticatedUserId: () => mocks.owner }));
vi.mock("@/lib/capture/processor", () => ({ commitCapture: mocks.commit }));
vi.mock("@/lib/supabase/capturePersistence", () => ({ retryCaptureImagesWithResult: mocks.retry }));
vi.mock("@/lib/capture/studyDocument", () => ({ openStudyDocument: async () => ({ sourceKind: mocks.slides ? "slides" : "pdf", fileName: mocks.slides ? "Lecture.pptx" : "Handbook.pdf", fileHash: mocks.hash, pages: 8, render: mocks.render, destroy: mocks.destroy }) }));
const receipt = { captureId: "capture", materialIds: ["a", "b", "c", "d"], processingStatus: "ready" };
function Location() { return <p data-testid="location">{useLocation().search}</p>; }
function mount() { return render(<MemoryRouter><PdfStudyImportDialog ownerId="owner" initial={{ classId: "drivers" }} onClose={mocks.close} /><Location /></MemoryRouter>); }
async function choosePdf() {
  fireEvent.change(screen.getByLabelText(/Choose PDF or PowerPoint|Reselect file to resume/), { target: { files: [new File(["%PDF-test"], "Handbook.pdf", { type: "application/pdf" })] } });
  await screen.findByText("Handbook.pdf · 8 PDF pages");
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.owner = "owner"; mocks.slides = false;
  URL.createObjectURL = vi.fn(() => "blob:preview"); URL.revokeObjectURL = vi.fn(); mocks.hash = "a".repeat(64);
  mocks.render.mockResolvedValue([new File(["image"], "page.jpg", { type: "image/jpeg" })]);
  mocks.destroy.mockResolvedValue(undefined); mocks.commit.mockResolvedValue(receipt); mocks.retry.mockResolvedValue({ processingStatus: "ready" });
});
describe("PDF study import UI", () => {
  it("reads locally first, then uses real capture and hands all batches to class practice", async () => {
    mount(); await choosePdf(); expect(mocks.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));
    await screen.findByText("8 of 8 selected pages processed · 0 skipped · 0 remaining");
    expect(mocks.commit).toHaveBeenCalledTimes(2);
    expect(mocks.commit).toHaveBeenNthCalledWith(1, "scan-material", expect.objectContaining({ classId: "drivers", topic: "Handbook.pdf · PDF pages 1–4" }), expect.objectContaining({ simulateDerivedContent: false, requireRemotePersistence: true, ownerId: "owner" }));
    fireEvent.click(screen.getByRole("button", { name: "Practice questions" }));
    expect(screen.getByTestId("location")).toHaveTextContent("classId=drivers&format=multiple_choice&scope=class");
  });
  it("locks the class/test after import starts and sends exam context to every batch", async () => {
    mount(); await choosePdf();
    fireEvent.change(screen.getByLabelText("Test (optional)"), { target: { value: "exam" } });
    fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));
    await screen.findByText("8 of 8 selected pages processed · 0 skipped · 0 remaining");
    expect(screen.getByLabelText("Class")).toBeDisabled();
    expect(screen.getByLabelText("Test (optional)")).toBeDisabled();
    for (const call of mocks.commit.mock.calls) expect(call[1].examId).toBe("exam");
    fireEvent.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(screen.getByTestId("location")).toHaveTextContent("examId=exam");
  });
  it("shows a mismatch, never auto-Keeps, and preserves the warning after remount", async () => {
    mocks.commit.mockResolvedValue({ ...receipt, processingStatus: "failed", classMismatch: { detectedSubject: "Accounting", detectedSubjectId: "business", selectedClassName: "Driver education" } });
    const view = mount(); await choosePdf(); fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));
    await screen.findByRole("heading", { name: "Looks like Accounting" });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave without keeping" }));
    expect(mocks.close).toHaveBeenCalled(); view.unmount(); mount();
    expect(screen.getByRole("heading", { name: "Looks like Accounting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it in Driver education" })).toBeDisabled();
    expect(readPdfCheckpoint("owner")!.batches[0].state).toBe("pending");
  });
  it("refuses a different reselected PDF without changing the saved attempt IDs", async () => {
    mocks.commit.mockRejectedValue(new Error("Offline"));
    const view = mount(); await choosePdf(); fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));
    await screen.findByText("Offline"); const before = readPdfCheckpoint("owner"); view.unmount();
    mocks.hash = "b".repeat(64); mount();
    fireEvent.change(screen.getByLabelText("Reselect file to resume"), { target: { files: [new File(["different"], "Other.pdf")] } });
    await screen.findByText("To resume, select the same file: Handbook.pdf.");
    expect(screen.getByRole("button", { name: "Resume import" })).toBeDisabled();
    expect(readPdfCheckpoint("owner")).toEqual(before);
  });
  it("blocks leaving mid-batch and pauses without starting another batch", async () => {
    let resolve!: (value: typeof receipt) => void;
    mocks.commit.mockImplementation(() => new Promise(r => { resolve = r; }));
    mount(); await choosePdf(); fireEvent.click(screen.getByRole("button", { name: "Add selected pages" }));
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(mocks.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause after current step" })); resolve(receipt);
    await screen.findByText("4 of 8 selected pages processed · 0 skipped · 4 remaining");
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
  it("does not upload after an account switch during PDF reading", async () => {
    mount(); mocks.owner = "someone-else";
    fireEvent.change(screen.getByLabelText(/Choose PDF/), { target: { files: [new File(["%PDF"], "Handbook.pdf")] } });
    await screen.findByText(/Your account changed/);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});

it("previews a PowerPoint locally, then preserves slide identity and the wrong-class gate", async () => {
  mocks.slides = true;
  mocks.commit.mockResolvedValue({ ...receipt, processingStatus: "failed", classMismatch: { detectedSubject: "Accounting", detectedSubjectId: "business", selectedClassName: "Driver education" } });
  mount();
  fireEvent.change(screen.getByLabelText(/Choose PDF/), { target: { files: [new File(["slides"], "Lecture.pptx")] } });
  await screen.findByRole("img", { name: "Preview of slide 1" });
  expect(mocks.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
  await screen.findByRole("img", { name: "Preview of slide 2" });
  expect(mocks.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add selected slides" }));
  await screen.findByRole("heading", { name: "Looks like Accounting" });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
  expect(mocks.commit.mock.calls[0][1].topic).toBe("Lecture.pptx · Slides 1–4");
  expect(mocks.retry).not.toHaveBeenCalled();
  expect(readPdfCheckpoint("owner")?.sourceKind).toBe("slides");
});
