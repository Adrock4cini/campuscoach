import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPdfCheckpoint, PDF_IMPORT_VERSION, pdfCaptureContext, pdfPageBatches, pdfProgress, readPdfCheckpoint, runPdfImport, savePdfCheckpoint, type PdfCheckpoint, type PdfImportDependencies } from "./pdfImport";
import type { CaptureResult } from "./types";

const mismatch = { detectedSubject: "Accounting", detectedSubjectId: "business", selectedClassName: "BIOL" };
const job = (): PdfCheckpoint => ({
  version: PDF_IMPORT_VERSION, ownerId: "owner", fileName: "Handbook.pdf", fileHash: "a".repeat(64), pages: 115,
  context: { classId: "driver-ed", date: "2026-09-09", examId: "exam" },
  batches: pdfPageBatches(55, 63, 115),
});
const result = (status: "ready" | "processing" | "failed" = "ready"): CaptureResult => ({
  id: "attempt", kind: "scan-material", context: job().context, createdAt: "now", keyConcepts: [], summary: "", flashcardCount: 0,
  captureId: "capture", materialIds: ["a", "b", "c", "d"], processingStatus: status,
});
function dependencies(overrides: Partial<PdfImportDependencies> = {}): PdfImportDependencies {
  return {
    assertOwner: vi.fn().mockResolvedValue(undefined), shouldPause: () => false,
    render: vi.fn().mockResolvedValue([new File(["image"], "page.jpg", { type: "image/jpeg" })]),
    commit: vi.fn().mockResolvedValue(result()), retry: vi.fn().mockResolvedValue({ processingStatus: "ready" }),
    save: vi.fn(savePdfCheckpoint), onBatch: vi.fn(), ...overrides,
  };
}
beforeEach(() => localStorage.clear());

describe("PDF page planning and owner-scoped checkpoints", () => {
  it("plans all 115 pages exactly once in groups of at most four", () => {
    const batches = pdfPageBatches(1, 115, 115);
    expect(batches).toHaveLength(29);
    expect(batches.flatMap(b => Array.from({ length: b.last - b.first + 1 }, (_, i) => b.first + i))).toEqual(Array.from({ length: 115 }, (_, i) => i + 1));
    expect(new Set(batches.map(b => b.attemptId)).size).toBe(29);
  });
  it.each([[0, 4, 115], [5, 4, 115], [1, 116, 115], [1.2, 4, 115], [1, 301, 301]])("rejects invalid ranges %s–%s of %s", (first, last, pages) => {
    expect(() => pdfPageBatches(first, last, pages)).toThrow();
  });
  it("retains the original exam/class/date and physical source page numbers", () => {
    expect(pdfCaptureContext(job(), job().batches[0])).toEqual({ classId: "driver-ed", date: "2026-09-09", examId: "exam", topic: "Handbook.pdf · PDF pages 55–58" });
  });
  it("resumes the same attempts only for the owning account", () => {
    const saved = job(); savePdfCheckpoint(saved);
    expect(readPdfCheckpoint("owner")).toEqual(saved);
    expect(readPdfCheckpoint("another-owner")).toBeNull();
    clearPdfCheckpoint("another-owner");
    expect(readPdfCheckpoint("owner")).toEqual(saved);
  });
  it("does not silently discard corrupt or foreign checkpoints", () => {
    localStorage.setItem("campus:pdf-import:owner", JSON.stringify({ ...job(), ownerId: "someone-else" }));
    expect(() => readPdfCheckpoint("owner")).toThrow(/cannot be resumed/);
  });
});

describe("PDF durable capture loop", () => {
  it("writes a checkpoint before render or network, then finishes the selected pages", async () => {
    let checkpointed = false;
    const deps = dependencies({ save: value => { savePdfCheckpoint(value); checkpointed = true; }, render: vi.fn(async () => { expect(checkpointed).toBe(true); return []; }) });
    const finished = await runPdfImport(job(), deps);
    expect(deps.commit).toHaveBeenCalledTimes(3);
    expect(pdfProgress(finished)).toEqual({ total: 9, ready: 9, skipped: 0, pending: 0 });
  });
  it("performs no upload if progress cannot be persisted", async () => {
    const deps = dependencies({ save: () => { throw new Error("Storage full"); } });
    await expect(runPdfImport(job(), deps)).rejects.toThrow("Storage full");
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it("stops before any later pages on mismatch, and reopening never presses Keep", async () => {
    const deps = dependencies({ commit: vi.fn().mockResolvedValue({ ...result("failed"), classMismatch: mismatch }) });
    const paused = await runPdfImport(job(), deps);
    expect(pdfProgress(paused).ready).toBe(0);
    expect(deps.commit).toHaveBeenCalledTimes(1);
    const reopened = dependencies();
    await runPdfImport(readPdfCheckpoint("owner")!, reopened);
    expect(reopened.commit).not.toHaveBeenCalled();
    expect(reopened.retry).not.toHaveBeenCalled();
  });
  it("Keep retries only the pending persisted batch; a later mismatch still stops", async () => {
    const saved = job(); saved.batches[0].receipt = { ...result("failed"), classMismatch: mismatch };
    const deps = dependencies({ commit: vi.fn().mockResolvedValue({ ...result("failed"), classMismatch: mismatch }) });
    const paused = await runPdfImport(saved, deps, true);
    expect(deps.retry).toHaveBeenCalledWith(expect.objectContaining({ captureId: "capture", classMismatch: mismatch }), true);
    expect(paused.batches[0].receipt?.classMismatch).toBeUndefined();
    expect(pdfProgress(paused).ready).toBe(4);
    expect(paused.batches[1].receipt?.classMismatch).toEqual(mismatch);
    expect(deps.commit).toHaveBeenCalledTimes(1);
  });
  it.each(["failed", "processing"] as const)("stops on %s, then retries saved sources without reupload", async status => {
    const deps = dependencies({ commit: vi.fn().mockResolvedValue(result(status)) });
    const paused = await runPdfImport(job(), deps);
    expect(deps.commit).toHaveBeenCalledTimes(1);
    const retry = dependencies({ shouldPause: () => false });
    const finished = await runPdfImport(paused, retry);
    expect(retry.retry).toHaveBeenCalledWith(paused.batches[0].receipt, false);
    expect(retry.commit).toHaveBeenCalledTimes(2);
    expect(pdfProgress(finished).ready).toBe(9);
  });
  it("a lost upload response reuses the checkpoint's exact attempt ID", async () => {
    const initial = job();
    await expect(runPdfImport(initial, dependencies({ commit: vi.fn().mockRejectedValue(new Error("Offline")) }))).rejects.toThrow("Offline");
    const retry = dependencies();
    await runPdfImport(readPdfCheckpoint("owner")!, retry);
    expect(retry.commit).toHaveBeenNthCalledWith(1, pdfCaptureContext(initial, initial.batches[0]), expect.any(Array), initial.batches[0].attemptId);
  });
  it("owner changes after rendering block all remote writes", async () => {
    let changed = false;
    const deps = dependencies({ render: async () => { changed = true; return []; }, assertOwner: async () => { if (changed) throw new Error("Changed owner"); } });
    await expect(runPdfImport(job(), deps)).rejects.toThrow("Changed owner");
    expect(deps.commit).not.toHaveBeenCalled();
  });
  it("pause during a request saves that receipt and does not start the next batch", async () => {
    let paused = false;
    const deps = dependencies({ shouldPause: () => paused, commit: vi.fn(async () => { paused = true; return result(); }) });
    const saved = await runPdfImport(job(), deps);
    expect(pdfProgress(saved).ready).toBe(4);
    expect(deps.commit).toHaveBeenCalledTimes(1);
  });
  it("skipped pages are never reported as ready", async () => {
    const initial = job(); initial.batches[0].state = "skipped";
    const deps = dependencies();
    expect(pdfProgress(await runPdfImport(initial, deps))).toEqual({ total: 9, ready: 5, skipped: 4, pending: 0 });
    expect(deps.commit).toHaveBeenCalledTimes(2);
  });
});
