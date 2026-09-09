import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealExams } from "@/lib/realData/hooks";
import { isPastDateKey, todayDateKey } from "@/lib/calendar/dateKey";
import { getAuthenticatedUserId } from "@/hooks/useClassIntelligence";
import { commitCapture } from "@/lib/capture/processor";
import { retryCaptureImagesWithResult } from "@/lib/supabase/capturePersistence";
import { clearPdfCheckpoint, PDF_IMPORT_VERSION, pdfPageBatches, pdfPageLabel, pdfProgress, readPdfCheckpoint, runPdfImport, savePdfCheckpoint, type PdfCheckpoint } from "@/lib/capture/pdfImport";
import type { OpenPdf } from "@/lib/capture/pdfRenderer";
import type { CaptureOpenOptions } from "@/contexts/CaptureContext";

interface Props { ownerId: string; initial: CaptureOpenOptions; onClose: () => void }
const fieldClass = "mt-1 w-full min-w-0 rounded-lg border border-border bg-background p-3 text-base text-foreground sm:text-sm";

export default function PdfStudyImportDialog({ ownerId, initial, onClose }: Props) {
  const navigate = useNavigate();
  const { classes, loading: classesLoading, error: classesError, reload } = useMyClasses();
  const [restored] = useState(() => {
    try { return { job: readPdfCheckpoint(ownerId), error: "" }; }
    catch (error) { return { job: null, error: error instanceof Error ? error.message : "Cannot read saved import progress." }; }
  });
  const [job, setJob] = useState<PdfCheckpoint | null>(restored.job);
  const [checkpointError, setCheckpointError] = useState(restored.error);
  const [classId, setClassId] = useState(restored.job?.context.classId ?? initial.classId ?? "");
  const [examId, setExamId] = useState(restored.job?.context.examId ?? initial.examId ?? "");
  const [pdf, setPdf] = useState<OpenPdf | null>(null);
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pauseRequested, setPauseRequested] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  const pause = useRef(false);
  const documentRef = useRef<OpenPdf | null>(null);
  const { items: exams, loading: examsLoading, error: examsError } = useRealExams(classId, !!classId);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; pause.current = true; void documentRef.current?.destroy(); };
  }, []);

  const assertOwner = async () => {
    if (!active.current || await getAuthenticatedUserId() !== ownerId || !active.current) {
      throw new Error("Your account changed. Reopen PDF import in the correct account.");
    }
  };

  const persist = (next: PdfCheckpoint) => { savePdfCheckpoint(next); setJob(next); };
  const selectFile = async (file?: File) => {
    if (!file || running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("Opening PDF on this device…");
    let opened: OpenPdf | null = null;
    try {
      await assertOwner();
      const { openPdf } = await import("@/lib/capture/pdfRenderer");
      opened = await openPdf(file);
      await assertOwner();
      if (job && (opened.fileHash !== job.fileHash || opened.pages !== job.pages)) throw new Error(`To resume, select the same PDF: ${job.fileName}.`);
      await documentRef.current?.destroy();
      documentRef.current = opened; setPdf(opened); opened = null;
      setFirst(job?.batches[0].first ?? 1);
      setLast(job?.batches.at(-1)?.last ?? documentRef.current.pages);
      setMessage("PDF opened. Nothing has been uploaded yet in this visit.");
    } catch (failure) {
      await opened?.destroy();
      if (active.current) { setError(failure instanceof Error ? failure.message : "Could not open this PDF."); setMessage(""); }
    } finally { running.current = false; if (active.current) setBusy(false); }
  };

  const start = async (keep = false) => {
    if (running.current || !pdf || checkpointError) return;
    running.current = true; pause.current = false; setPauseRequested(false); setBusy(true); setError("");
    try {
      await assertOwner();
      if (classesLoading || classesError || !classes.some(c => c.id === classId)) throw new Error("Choose one of your current classes before importing.");
      if (examId && (examsLoading || examsError || !exams.some(e => e.id === examId && e.client_class_id === classId))) throw new Error("This test could not be verified for the selected class. Check the test before importing.");
      const initialJob: PdfCheckpoint = job ?? {
        version: PDF_IMPORT_VERSION, ownerId, fileHash: pdf.fileHash, fileName: pdf.fileName, pages: pdf.pages,
        context: { classId, date: todayDateKey(), examId: examId || undefined,
          assignmentId: classId === initial.classId ? initial.assignmentId : undefined, topic: initial.topic },
        batches: pdfPageBatches(first, last, pdf.pages),
      };
      const result = await runPdfImport(initialJob, {
        assertOwner, shouldPause: () => pause.current || !active.current,
        render: batch => pdf.render(batch),
        commit: (context, files, attemptId) => commitCapture("scan-material", context, {
          simulateDerivedContent: false, requireRemotePersistence: true, ownerId, attachments: files, attemptId,
        }),
        retry: (receipt, confirmed) => retryCaptureImagesWithResult(receipt.captureId!, receipt.materialIds!, { keepInSelectedClass: confirmed }),
        save: persist,
        onBatch: batch => setMessage(`${pdfPageLabel(batch)}: saving private pages and checking for study concepts…`),
      }, keep);
      if (active.current) {
        setMessage(pdfProgress(result).pending ? "Import paused. Already processed pages are saved. Resume below when you’re ready." : "Selected pages finished. Importing material does not increase preparedness; practice does.");
      }
    } catch (failure) {
      if (active.current) { setError(failure instanceof Error ? failure.message : "Import paused. Please try again."); setMessage("Import paused. Any already saved pages remain in Class Memory."); }
    } finally { running.current = false; if (active.current) setBusy(false); }
  };

  const pending = job?.batches.find(b => b.state === "pending");
  const mismatch = pending?.receipt?.classMismatch;
  const progress = job ? pdfProgress(job) : null;
  const selectedClass = classes.find(c => c.id === classId);
  const reset = () => {
    if (running.current || !window.confirm("Forget this device’s import checkpoint? Saved pages and concepts will stay in Class Memory. Importing the same pages again as a new job may create duplicates.")) return;
    try { clearPdfCheckpoint(ownerId); setJob(null); setCheckpointError(""); setError(""); setMessage(""); }
    catch { setError("Could not clear this device’s saved progress."); }
  };
  const skip = () => {
    if (!job || !pending || running.current || !window.confirm(`Skip ${pdfPageLabel(pending)}? These pages will not count as processed. Any saved source images remain private in Class Memory.`)) return;
    try { persist({ ...job, batches: job.batches.map(b => b.attemptId === pending.attemptId ? { ...b, state: "skipped" } : b) }); setError(""); setMessage("Pages skipped, not counted as processed. Resume to continue with the next pages."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save progress."); }
  };
  const study = (format: string) => {
    const params = new URLSearchParams({ classId, format, scope: "class" });
    if (job?.context.examId) { params.set("examId", job.context.examId); params.delete("scope"); }
    onClose(); navigate(`/study-lab?${params}`);
  };

  return <Dialog open onOpenChange={open => { if (!open && !running.current) onClose(); }}>
    <DialogContent data-feature="pdf-study-import-v1">
      <DialogTitle>Upload PDF study material</DialogTitle>
      <DialogDescription>Choose a class, add pages, then practice from what was saved. PDF import supports handbooks, notes and other course material.</DialogDescription>
      {checkpointError && <p role="alert">{checkpointError}</p>}
      {job && <p className="break-words text-sm">Saved import: {job.fileName}. Reselect the same PDF to resume on this device. {job.context.topic && `Topic: ${job.context.topic}.`}</p>}
      <label className="text-sm">Class
        <select aria-label="Class" className={fieldClass} value={classId} disabled={busy || !!job || classesLoading} onChange={e => { setClassId(e.target.value); setExamId(""); }}>
          <option value="">{classesLoading ? "Loading classes…" : "Choose a class"}</option>
          {job && !selectedClass && <option value={classId}>Saved class (unavailable)</option>}
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {classesError && <div role="alert">Could not load classes. <Button variant="outline" onClick={() => void reload()}>Retry classes</Button></div>}
      {!classesLoading && !classesError && !classes.length && <Button variant="outline" onClick={() => { onClose(); navigate("/classes"); }}>Add a class first</Button>}
      <label className="text-sm">Test (optional)
        <select aria-label="Test (optional)" className={fieldClass} value={examId} disabled={busy || !!job || !classId || examsLoading} onChange={e => setExamId(e.target.value)}>
          <option value="">Class material — no specific test</option>
          {exams.filter(e => e.client_class_id === classId && (e.id === examId || !isPastDateKey(e.exam_date))).map(e => <option value={e.id} key={e.id}>{e.title}</option>)}
        </select>
      </label>
      {examsError && <p className="text-sm">Tests could not be loaded. You can still add material without linking a test.</p>}
      <label className="text-sm">{job ? "Reselect PDF to resume" : "Choose PDF (up to 25 MB, 300 pages)"}
        <input className={`${fieldClass} text-xs`} type="file" accept="application/pdf,.pdf" disabled={busy || !!checkpointError} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void selectFile(file); }} />
      </label>
      {pdf && <>
        <p className="break-words text-sm">{pdf.fileName} · {pdf.pages} PDF pages</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">First PDF page<input className={fieldClass} type="number" min="1" max={pdf.pages} value={first} disabled={busy || !!job} onChange={e => setFirst(Number(e.target.value))} /></label>
          <label className="text-sm">Last PDF page<input className={fieldClass} type="number" min={first} max={pdf.pages} value={last} disabled={busy || !!job} onChange={e => setLast(Number(e.target.value))} /></label>
        </div>
      </>}
      <p className="text-xs text-muted-foreground">Count PDF pages from the cover, not the printed page numbers. Pages are processed in groups of up to 4; long documents may need several sessions due to processing limits. Try a chapter first.</p>
      <p className="text-xs text-muted-foreground">Selected pages are saved privately as images, including diagrams. The original PDF stays on your device. Uploading does not mean you have practiced or mastered the material.</p>
      {progress && <div aria-live="polite" className="rounded-lg border p-3 text-sm">
        <p>{progress.ready} of {progress.total} selected pages processed · {progress.skipped} skipped · {progress.pending} remaining</p>
        {progress.ready > 0 && <p>Material added. Preparedness comes from saved practice answers.</p>}
      </div>}
      <p role="status" className="text-sm">{message}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {mismatch && <section role="alert" className="space-y-2 rounded-lg border border-amber-500 p-3 text-sm">
        <h3 className="font-semibold">Looks like {mismatch.detectedSubject}</h3>
        <p>You chose {mismatch.selectedClassName}. Nothing from {pdfPageLabel(pending!)} was added to its study set.</p>
        <p>Is this material really for this class? Keeping applies only to these pages.</p>
        <Button className="h-auto whitespace-normal" variant="outline" disabled={busy || !pdf} onClick={() => void start(true)}>Keep it in {mismatch.selectedClassName}</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Leave without keeping</Button>
      </section>}
      {pending?.receipt && !mismatch && pending.receipt.processingStatus !== "ready" && <p className="text-sm">{pending.receipt.processingMessage || "These pages have not finished processing. If a service limit was reached, try resuming later."} No remaining pages are marked ready.</p>}
      {busy ? <Button variant="outline" disabled={pauseRequested} onClick={() => { pause.current = true; setPauseRequested(true); }}> {pauseRequested ? "Pausing after current step…" : "Pause after current step"}</Button>
        : (!job || progress!.pending > 0) && !mismatch && <Button disabled={!pdf || !selectedClass || !!classesError || !!checkpointError} onClick={() => void start()}>{job ? "Resume import" : "Add selected pages"}</Button>}
      {!busy && pending && (mismatch || pending.receipt?.processingStatus === "failed") && <Button variant="outline" onClick={skip}>Skip these pages</Button>}
      {progress && progress.ready > 0 && <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => study("multiple_choice")}>Practice questions</Button>
        <Button variant="outline" disabled={busy} onClick={() => study("flashcards")}>Flashcards</Button>
      </div>}
      {job && <Button variant="outline" disabled={busy} onClick={() => { onClose(); navigate(`/classes/${encodeURIComponent(job.context.classId)}`); }}>Open class & source pages</Button>}
      {(job || checkpointError) && <Button variant="ghost" disabled={busy} onClick={reset}>Start another PDF</Button>}
    </DialogContent>
  </Dialog>;
}
