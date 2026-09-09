import { z } from "zod";
import type { CaptureContext, CaptureResult } from "./types";

export const PDF_IMPORT_VERSION = "pdf-pages-v1";
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_MAX_PAGES = 300;
export const PDF_BATCH_SIZE = 4;

const receiptSchema = z.object({
  captureId: z.string().optional(),
  materialIds: z.array(z.string()).max(PDF_BATCH_SIZE).optional(),
  processingStatus: z.enum(["ready", "processing", "failed"]).optional(),
  processingMessage: z.string().optional(),
  classMismatch: z.object({ detectedSubject: z.string(), detectedSubjectId: z.string(), selectedClassName: z.string() }).optional(),
});
const batchSchema = z.object({
  first: z.number().int().positive(), last: z.number().int().positive(),
  attemptId: z.string().uuid(), state: z.enum(["pending", "ready", "skipped"]),
  receipt: receiptSchema.optional(),
});
const checkpointSchema = z.object({
  version: z.literal(PDF_IMPORT_VERSION), ownerId: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string().min(1).max(255),
  pages: z.number().int().min(1).max(PDF_MAX_PAGES),
  sourceKind: z.enum(["pdf", "slides"]).optional(),
  context: z.object({
    classId: z.string().min(1), date: z.string(), topic: z.string().optional(),
    examId: z.string().optional(), assignmentId: z.string().optional(),
  }),
  batches: z.array(batchSchema).min(1).max(Math.ceil(PDF_MAX_PAGES / PDF_BATCH_SIZE)),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.batches.forEach((batch, i) => {
    if (batch.last < batch.first || batch.last > value.pages || batch.last - batch.first >= PDF_BATCH_SIZE
      || (i > 0 && batch.first !== value.batches[i - 1].last + 1) || ids.has(batch.attemptId)
      || (batch.state === "ready" && (!batch.receipt?.captureId || batch.receipt.processingStatus !== "ready" || batch.receipt.classMismatch))) {
      ctx.addIssue({ code: "custom", message: "Invalid PDF checkpoint" });
    }
    ids.add(batch.attemptId);
  });
});

export type PdfCheckpoint = z.infer<typeof checkpointSchema>;
export type PdfBatch = PdfCheckpoint["batches"][number];
export type PdfReceipt = z.infer<typeof receiptSchema>;

export function pdfPageBatches(first: number, last: number, pages: number, uuid = () => crypto.randomUUID()): PdfBatch[] {
  if (![first, last, pages].every(Number.isInteger) || first < 1 || last < first || last > pages || pages > PDF_MAX_PAGES) {
    throw new Error(`Choose PDF pages between 1 and ${pages}, with the first page before the last.`);
  }
  return Array.from({ length: Math.ceil((last - first + 1) / PDF_BATCH_SIZE) }, (_, i) => ({
    first: first + i * PDF_BATCH_SIZE, last: Math.min(last, first + i * PDF_BATCH_SIZE + PDF_BATCH_SIZE - 1),
    attemptId: uuid(), state: "pending" as const,
  }));
}

const key = (ownerId: string) => `campus:pdf-import:${ownerId}`;

// No PDF bytes or extracted text are kept in browser storage. The source file
// must be reselected after reload. Stable attempt IDs recover lost responses.
export function readPdfCheckpoint(ownerId: string, storage: Storage = localStorage): PdfCheckpoint | null {
  const raw = storage.getItem(key(ownerId));
  if (!raw) return null;
  try {
    const value = checkpointSchema.parse(JSON.parse(raw));
    if (value.ownerId !== ownerId) throw new Error();
    return value;
  } catch {
    // Do not silently start a second import over a checkpoint we can't read.
    throw new Error("This saved PDF import cannot be resumed. Review Class Memory before starting it again.");
  }
}

export function savePdfCheckpoint(value: PdfCheckpoint, storage: Storage = localStorage): void {
  checkpointSchema.parse(value);
  try { storage.setItem(key(value.ownerId), JSON.stringify(value)); }
  catch { throw new Error("Cannot save import progress on this device. Free browser storage before continuing. Already saved pages remain in Class Memory."); }
}

export function clearPdfCheckpoint(ownerId: string, storage: Storage = localStorage) {
  storage.removeItem(key(ownerId));
}

export function pdfPageLabel(batch: Pick<PdfBatch, "first" | "last">, sourceKind?: "pdf" | "slides") {
  if (sourceKind === "slides") return batch.first === batch.last ? `Slide ${batch.first}` : `Slides ${batch.first}–${batch.last}`;
  return batch.first === batch.last ? `PDF page ${batch.first}` : `PDF pages ${batch.first}–${batch.last}`;
}

export function pdfCaptureContext(job: PdfCheckpoint, batch: PdfBatch): CaptureContext {
  return { ...job.context, topic: `${job.fileName} · ${pdfPageLabel(batch, job.sourceKind)}${job.context.topic ? ` · ${job.context.topic}` : ""}` };
}

export function pdfProgress(job: PdfCheckpoint) {
  const count = (state?: PdfBatch["state"]) => job.batches.filter(b => !state || b.state === state).reduce((n, b) => n + b.last - b.first + 1, 0);
  return { total: count(), ready: count("ready"), skipped: count("skipped"), pending: count("pending") };
}

export interface PdfImportDependencies {
  assertOwner: () => Promise<void>;
  shouldPause: () => boolean;
  render: (batch: PdfBatch) => Promise<File[]>;
  commit: (context: CaptureContext, files: File[], attemptId: string) => Promise<CaptureResult>;
  retry: (receipt: PdfReceipt, keep: boolean) => Promise<PdfReceipt>;
  save: (job: PdfCheckpoint) => void;
  onBatch: (batch: PdfBatch) => void;
}

/** Stops at the FIRST unresolved batch. Never auto-confirms a class mismatch. */
export async function runPdfImport(initial: PdfCheckpoint, deps: PdfImportDependencies, keepFirstBatch = false) {
  let job = checkpointSchema.parse(initial);
  await deps.assertOwner();
  deps.save(job); // Durable idempotency checkpoint BEFORE any remote write.
  let keep = keepFirstBatch;
  for (let i = 0; i < job.batches.length; i++) {
    const batch = job.batches[i];
    if (batch.state !== "pending") continue;
    if (deps.shouldPause()) break;
    if (batch.receipt?.classMismatch && !keep) break;
    await deps.assertOwner();
    deps.onBatch(batch);
    let receipt: PdfReceipt;
    const saved = batch.receipt;
    if (saved?.captureId && saved.materialIds?.length === batch.last - batch.first + 1) {
      const response = await deps.retry(saved, keep);
      receipt = { ...saved, ...response, classMismatch: response.classMismatch };
    } else {
      // Explicit Keep must reference the exact persisted source, never a new upload.
      if (keep) throw new Error("Cannot confirm these pages yet. Resume the upload first.");
      const files = await deps.render(batch);
      await deps.assertOwner();
      if (deps.shouldPause()) break;
      receipt = receiptSchema.parse(await deps.commit(pdfCaptureContext(job, batch), files, batch.attemptId));
    }
    keep = false;
    await deps.assertOwner();
    const ready = receipt.processingStatus === "ready" && !receipt.classMismatch && !!receipt.captureId;
    job = { ...job, batches: job.batches.map((b, j) => j === i ? { ...b, receipt, state: ready ? "ready" : "pending" } : b) };
    deps.save(job);
    if (!ready) break;
  }
  return job;
}
