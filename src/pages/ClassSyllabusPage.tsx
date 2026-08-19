import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import {
  SyllabusReviewForm,
} from "@/components/syllabus/SyllabusReviewForm";
import { validateSyllabusReview } from "@/components/syllabus/reviewValidation";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import {
  MAX_SYLLABUS_BYTES,
  SYLLABUS_MIME_TYPES,
  commitClassSyllabus,
  createSignedSyllabusUrl,
  createSyllabusReviewDraft,
  deleteUncommittedSyllabusSource,
  getClassSyllabus,
  getClassSyllabusRequest,
  parseClassSyllabus,
  uploadSyllabusSource,
  type ClassSyllabus,
  type ParsedSyllabus,
  type SyllabusReviewDraft,
  type TargetClassContext,
  type UploadedSyllabusSource,
} from "@/lib/syllabus";
import type { ClassInfo } from "@/data/demo";

const ACCEPTED_FILE_TYPES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

import { summarizeSyllabusReview } from "@/lib/syllabus/importSummary";

type WorkState = "idle" | "parsing" | "uploading" | "saving";

interface PendingSyllabusCommit {
  requestId: string;
  source: UploadedSyllabusSource;
  parsed: ParsedSyllabus;
  review: SyllabusReviewDraft;
}

function readableError(error: unknown, fallback: string) {
  const message = errorMessage(error).trim();
  return message && message.length <= 220 ? message : fallback;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

function isExpiredSyllabusUpload(error: unknown) {
  const message = errorMessage(error);
  return message.includes("Syllabus source upload expired while it was awaiting review")
    || message.includes("Uploaded syllabus source was not found")
    || message.includes("Syllabus source object does not exist");
}

function isAcceptedSyllabusFile(file: File) {
  if ((SYLLABUS_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  return !file.type && /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function syllabusMismatch(
  target: Pick<ClassInfo, "name" | "courseCode">,
  detected: { name?: string | null; code?: string | null },
) {
  const targetName = normalizeIdentity(target.name);
  const sourceName = normalizeIdentity(detected.name);
  const targetCode = normalizeIdentity(target.courseCode);
  const sourceCode = normalizeIdentity(detected.code);
  const nameDiffers = Boolean(sourceName && targetName && sourceName !== targetName);
  const codeDiffers = Boolean(sourceCode && targetCode && sourceCode !== targetCode);
  return nameDiffers || codeDiffers;
}

function targetContext(classInfo: ClassInfo): TargetClassContext {
  return {
    id: classInfo.uuid ?? "",
    clientClassId: classInfo.id,
    name: classInfo.name,
    code: classInfo.courseCode,
    term: classInfo.term,
    weekdays: classInfo.days,
    startTimeKey: classInfo.startTimeKey,
    endTimeKey: classInfo.endTimeKey,
    semesterStartDate: classInfo.semesterStartDate,
    semesterEndDate: classInfo.semesterEndDate,
    schedule: classInfo.schedule,
  };
}

function recordValue(record: ClassSyllabus, ...keys: string[]) {
  const values = record as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = values[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function existingFileName(record: ClassSyllabus) {
  return recordValue(record, "originalName", "originalFilename", "original_filename", "filename") || "Saved syllabus";
}

function existingStoragePath(record: ClassSyllabus) {
  return recordValue(record, "storagePath", "storage_path");
}

function existingUpdatedAt(record: ClassSyllabus) {
  const value = recordValue(record, "updatedAt", "updated_at", "createdAt", "created_at");
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ClassSyllabusPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user, isDemoMode } = useAuth();
  const userId = user?.id;
  const { classes, loading, error: classesError, reload } = useMyClasses();
  const classInfo = classes.find((item) => item.id === classId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [workState, setWorkState] = useState<WorkState>("idle");
  const [pageError, setPageError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [sourceLookupBlocked, setSourceLookupBlocked] = useState(false);
  const [existing, setExisting] = useState<ClassSyllabus | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSyllabus | null>(null);
  const [selectedClassIndex, setSelectedClassIndex] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, SyllabusReviewDraft>>({});
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [pendingCommit, setPendingCommit] = useState<PendingSyllabusCommit | null>(null);

  const destination = classInfo ? `/classes/${classInfo.id}` : "/classes";
  // After a successful save the student lands on the class with one obvious
  // next study step instead of an unchanged-looking class page.
  const savedDestination = classInfo ? `/classes/${classInfo.id}?saved=syllabus` : "/classes";
  const target = useMemo(() => classInfo ? targetContext(classInfo) : null, [classInfo]);
  const review = selectedClassIndex === null ? null : drafts[selectedClassIndex] ?? null;
  const detectedClass = parsed && selectedClassIndex !== null ? parsed.classes[selectedClassIndex] : null;
  const mismatch = Boolean(classInfo && detectedClass && syllabusMismatch(classInfo, detectedClass));
  const validation = useMemo(() => review ? validateSyllabusReview(review) : null, [review]);
  const summary = useMemo(() => review ? summarizeSyllabusReview(review) : null, [review]);
  const canSave = Boolean(
    file
    && parsed
    && review
    && validation?.valid
    && (!mismatch || mismatchAcknowledged)
    && !existingLoading
    && !sourceLookupBlocked
    && workState === "idle",
  );

  useEffect(() => {
    if (!classInfo?.uuid || !userId || isDemoMode) return;
    let active = true;
    setExisting(null);
    setExistingLoading(true);
    setSourceError("");
    setSourceLookupBlocked(false);
    void getClassSyllabus(classInfo.uuid)
      .then((record) => {
        if (active) setExisting(record);
      })
      .catch((loadError) => {
        if (!active) return;
        console.warn("[class-syllabus] source lookup failed", loadError);
        setSourceLookupBlocked(true);
        setSourceError("We couldn’t check this class’s saved syllabus. You can retry without losing your work.");
      })
      .finally(() => {
        if (active) setExistingLoading(false);
      });
    return () => { active = false; };
  }, [classInfo?.uuid, isDemoMode, userId]);

  useEffect(() => {
    setFile(null);
    setParsed(null);
    setSelectedClassIndex(null);
    setDrafts({});
    setMismatchAcknowledged(false);
    setPendingCommit(null);
    setPageError("");
  }, [classInfo?.uuid]);

  const chooseDetectedClass = (index: number, parsedValue = parsed) => {
    if (!parsedValue || !target) return;
    setSelectedClassIndex(index);
    setMismatchAcknowledged(false);
    setDrafts((current) => current[index]
      ? current
      : { ...current, [index]: createSyllabusReviewDraft(parsedValue, index, target) });
  };

  const readFile = async (nextFile: File) => {
    if (pendingCommit) return;
    setPageError("");
    if (nextFile.size > MAX_SYLLABUS_BYTES) {
      setPageError("That file is too large. Choose a PDF or photo under 15 MB.");
      return;
    }
    if (!isAcceptedSyllabusFile(nextFile)) {
      setPageError("Choose a PDF, JPG, PNG, WebP, HEIC, or HEIF syllabus file.");
      return;
    }
    if (!target) return;

    setWorkState("parsing");
    try {
      const nextParsed = await parseClassSyllabus(nextFile, target);
      setFile(nextFile);
      setParsed(nextParsed);
      setDrafts({});
      setMismatchAcknowledged(false);
      if (nextParsed.classes.length === 1) {
        setSelectedClassIndex(0);
        setDrafts({ 0: createSyllabusReviewDraft(nextParsed, 0, target) });
      } else {
        // Never guess when a document appears to contain more than one class.
        setSelectedClassIndex(null);
      }
    } catch (parseError) {
      console.warn("[class-syllabus] parse failed", parseError);
      setPageError(readableError(parseError, "We couldn’t read that syllabus. Try a clearer PDF or photo."));
    } finally {
      setWorkState("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const openExisting = async () => {
    if (!existing) return;
    const path = existingStoragePath(existing);
    if (!path) {
      setSourceError("This saved syllabus is missing its private file link. Replacing it will repair the source.");
      return;
    }
    setSourceError("");
    const sourceTab = window.open("about:blank", "_blank");
    if (sourceTab) sourceTab.opener = null;
    try {
      const url = await createSignedSyllabusUrl(path);
      if (!sourceTab) {
        setSourceError("Your browser blocked the syllabus tab. Allow pop-ups for Campus Companion, then try again.");
        return;
      }
      sourceTab.location.href = url;
    } catch (openError) {
      sourceTab?.close();
      console.warn("[class-syllabus] signed source failed", openError);
      setSourceError("We couldn’t open the private source right now. Your saved dates are still intact.");
    }
  };

  const save = async () => {
    if (!classInfo?.uuid || !file || !parsed || !review || !canSave) return;
    setPageError("");
    setWorkState(pendingCommit ? "saving" : "uploading");
    let attempt = pendingCommit;

    const finish = () => {
      setPendingCommit(null);
      window.dispatchEvent(new CustomEvent("real-assignments:changed"));
      window.dispatchEvent(new CustomEvent("real-exams:changed"));
      window.dispatchEvent(new CustomEvent("coach:refresh"));
      toast.success(existing ? "Syllabus replaced" : "Syllabus saved", {
        description: `Reviewed assignments, exams, dates, and study topics are now connected to ${classInfo.name}.`,
      });
      navigate(savedDestination, { replace: true });
    };

    const cleanupDuplicateSource = async (storagePath: string | null | undefined) => {
      if (!storagePath) return;
      try {
        await deleteUncommittedSyllabusSource(storagePath);
      } catch (cleanupError) {
        // The database commit is already authoritative. A storage cleanup
        // failure must never turn a successful syllabus save into a retry.
        console.warn("[class-syllabus] duplicate source cleanup failed", cleanupError);
      }
    };

    try {
      if (!attempt) {
        const requestId = crypto.randomUUID();
        const source = await uploadSyllabusSource({ classUuid: classInfo.uuid, file, requestId });
        attempt = { requestId, source, parsed, review };
        setPendingCommit(attempt);
      }
      setWorkState("saving");
      const result = await commitClassSyllabus({
        classUuid: classInfo.uuid,
        clientClassId: classInfo.id,
        requestId: attempt.requestId,
        source: attempt.source,
        parsed: attempt.parsed,
        review: attempt.review,
      });
      await cleanupDuplicateSource(result.cleanupPath);
      finish();
    } catch (saveError) {
      console.warn("[class-syllabus] save failed", saveError);
      if (!attempt) {
        setPageError(readableError(saveError, "We couldn’t upload this syllabus. Your corrections are still here—please try again."));
        return;
      }

      // Cleanup fenced this old, uncommitted source before the save began.
      // Keep the parsed review, but clear the stale request so the next Save
      // creates a fresh upload instead of endlessly retrying an expired path.
      if (isExpiredSyllabusUpload(saveError)) {
        setPendingCommit(null);
        setPageError("That upload expired before it was saved. Your review is still here—choose Save again to upload a fresh private copy.");
        return;
      }

      // A dropped response can look like a failed commit even after the RPC
      // succeeded. Reconcile by the stable request ID before deleting or
      // creating another upload.
      let committedRequest;
      try {
        committedRequest = await getClassSyllabusRequest(attempt.requestId);
      } catch (lookupError) {
        console.warn("[class-syllabus] commit reconciliation failed", lookupError);
        setPageError("We couldn’t confirm whether the save finished. Your exact upload is ready to retry safely—no new copy will be created.");
        return;
      }

      if (committedRequest?.result && committedRequest.classId === classInfo.uuid) {
        await cleanupDuplicateSource(committedRequest.result.cleanupPath);
        finish();
        return;
      }

      // A null receipt can race a transaction that is still committing. Keep
      // the exact request and upload for an idempotent retry; deleting here
      // could remove the source immediately before the commit becomes visible.
      setPageError("We couldn’t confirm whether the save finished. Your exact prior upload is ready to retry safely—no new copy will be created.");
    } finally {
      setWorkState("idle");
    }
  };

  if (!user || isDemoMode) {
    return (
      <Card className="mx-auto mt-8 max-w-lg border-primary/20 shadow-card">
        <CardContent className="space-y-4 p-8 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Sign in to save a class syllabus</h1>
          <p className="text-sm text-muted-foreground">Syllabus files and class dates stay private to your account.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !classInfo) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading your class…</p>;
  }

  if (classesError && !classInfo) {
    return <div className="mx-auto max-w-2xl py-12"><ClassesLoadError onRetry={() => void reload()} /></div>;
  }

  if (!classInfo) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Class not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose an existing class before importing its syllabus.</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => navigate("/classes")}>Back to classes</Button>
      </div>
    );
  }

  if (!classInfo.uuid) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">This class is still syncing</h1>
        <p className="mt-2 text-sm text-muted-foreground">Return to the class and try again once it finishes saving.</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => navigate(destination)}>Back to {classInfo.name}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={`Back to ${classInfo.name}`}
          onClick={() => navigate(destination)}
          disabled={workState === "uploading" || workState === "saving" || Boolean(pendingCommit)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 pt-1">
          <h1 className="font-display text-2xl font-semibold md:text-3xl">{classInfo.name} syllabus</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review assignments, quizzes, exam dates, test topics, and the class schedule before anything is saved.</p>
        </div>
      </div>

      <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-foreground">This import belongs only to {classInfo.name}</p>
          <p className="mt-1 text-muted-foreground">Campus Companion will not create, rename, or silently switch classes from this file.</p>
        </div>
      </div>

      <Card className="rounded-[26px] border-border/60 shadow-card">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <FileCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold">Saved source</h2>
                {existing ? (
                  <>
                    <p className="mt-1 truncate text-sm font-medium">{existingFileName(existing)}</p>
                    {existingUpdatedAt(existing) && <p className="text-xs text-muted-foreground">Last saved {existingUpdatedAt(existing)}</p>}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{existingLoading ? "Checking…" : "No syllabus saved for this class yet."}</p>
                )}
              </div>
            </div>
            {existing && (
              <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => void openExisting()}>
                <ExternalLink className="mr-2 h-4 w-4" /> Open
              </Button>
            )}
          </div>
          {sourceError && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{sourceError}</span>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => {
                if (!classInfo.uuid) return;
                setSourceError("");
                setSourceLookupBlocked(false);
                setExistingLoading(true);
                void getClassSyllabus(classInfo.uuid)
                  .then(setExisting)
                  .catch(() => {
                    setSourceLookupBlocked(true);
                    setSourceError("We still couldn’t check the saved source. Your class data was not deleted.");
                  })
                  .finally(() => setExistingLoading(false));
              }}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[26px] border-border/60 shadow-card">
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              <FileText aria-hidden="true" className="h-5 w-5 text-primary" />
              {existing ? "Replace this class’s syllabus" : "Add this class’s syllabus"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose one PDF or one clear photo up to 15 MB. Nothing is saved until you confirm the review.</p>
            <p className="mt-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Have several paper pages?</span>{" "}
              Combine them into one PDF with your phone’s document scanner. On iPhone, open Files, tap More (…), choose Scan Documents, scan every page, tap Done, save the PDF, then choose it here.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Checked items will appear in this class, your calendar and dashboard. Exam topics help Study Lab focus the notes and captures you save for this class.</p>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="sr-only"
            aria-label="Take a syllabus photo"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (nextFile) void readFile(nextFile);
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="sr-only"
            aria-label="Choose a syllabus file"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (nextFile) void readFile(nextFile);
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={workState !== "idle" || Boolean(pendingCommit)}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="mr-2 h-4 w-4" /> Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={workState !== "idle" || Boolean(pendingCommit)}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> Choose PDF or photo
            </Button>
          </div>

          {(workState === "uploading" || workState === "saving") && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm" role="status" aria-live="polite">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
              {workState === "uploading"
                ? `Uploading your private copy to ${classInfo.name}…`
                : `Saving reviewed dates to ${classInfo.name}…`}
            </div>
          )}

          {workState === "parsing" && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm" role="status" aria-live="polite">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
              Reading the syllabus and finding assignments, dates, and study topics…
            </div>
          )}

          {pendingCommit && workState === "idle" && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm" role="status">
              <RefreshCw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>Campus Companion is holding the exact prior upload for a safe retry. Confirm the save again; it will not create another copy.</p>
            </div>
          )}

          {file && parsed && workState !== "parsing" && (
            <div className="space-y-4 border-t border-border/60 pt-5">
              <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                <FileCheck2 aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={Boolean(pendingCommit)} onClick={() => fileInputRef.current?.click()}>Change</Button>
              </div>

              {parsed.classes.length > 1 && (
                <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <Label htmlFor="detected-class">Which part of the file belongs to {classInfo.name}?</Label>
                  <p className="text-xs text-muted-foreground">The file appears to contain more than one class. Choose one; nothing else will be imported.</p>
                  <Select
                    value={selectedClassIndex === null ? "" : String(selectedClassIndex)}
                    onValueChange={(value) => chooseDetectedClass(Number(value))}
                    disabled={Boolean(pendingCommit)}
                  >
                    <SelectTrigger id="detected-class" className="min-h-11">
                      <SelectValue placeholder="Choose a detected class" />
                    </SelectTrigger>
                    <SelectContent>
                      {parsed.classes.map((course, index) => (
                        <SelectItem key={`${course.name}-${index}`} value={String(index)}>
                          {course.name || `Detected class ${index + 1}`}{course.code ? ` · ${course.code}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {review && detectedClass && (
                <>
                  {mismatch && (
                    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                        <div>
                          <p className="font-medium">Check that this is the right class</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            The file says “{detectedClass.name || `Detected class ${selectedClassIndex + 1}`}{detectedClass.code ? ` · ${detectedClass.code}` : ""},” but it will be saved only to “{classInfo.name}{classInfo.courseCode ? ` · ${classInfo.courseCode}` : ""}.”
                          </p>
                        </div>
                      </div>
                      <div className="flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm font-medium">
                        <Checkbox
                          id="confirm-syllabus-class"
                          checked={mismatchAcknowledged}
                          onCheckedChange={(checked) => setMismatchAcknowledged(checked === true)}
                          disabled={Boolean(pendingCommit)}
                          className="h-5 w-5"
                          aria-label={`Confirm this syllabus belongs to ${classInfo.name}`}
                        />
                        <Label htmlFor="confirm-syllabus-class" className="flex min-h-11 cursor-pointer items-center">
                          I confirm this syllabus belongs to {classInfo.name}.
                        </Label>
                      </div>
                    </div>
                  )}

                  {summary && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
                      <p className="font-medium text-foreground">Found in this file for {classInfo.name}</p>
                      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-3">
                        <li>{summary.assignments} assignment{summary.assignments === 1 ? "" : "s"}</li>
                        <li>{summary.quizzes} quiz{summary.quizzes === 1 ? "" : "zes"}</li>
                        <li>{summary.exams} test{summary.exams === 1 ? "" : "s"}</li>
                        <li>{summary.scheduleDays} class day{summary.scheduleDays === 1 ? "" : "s"}</li>
                        <li>{summary.topics} test topic{summary.topics === 1 ? "" : "s"}</li>
                      </ul>
                      {summary.needsAttention.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Needs a quick look: {summary.needsAttention.join(" · ")}.
                        </p>
                      )}
                    </div>
                  )}

                  <SyllabusReviewForm
                    value={review}
                    validation={validation ?? undefined}
                    disabled={workState !== "idle" || Boolean(pendingCommit)}
                    onChange={(next) => setDrafts((current) => ({
                      ...current,
                      [next.selectedClassIndex]: next,
                    }))}
                  />

                  <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
                    <Button type="button" variant="ghost" className="min-h-11" disabled={workState === "uploading" || workState === "saving" || Boolean(pendingCommit)} onClick={() => navigate(destination)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11 bg-gradient-calm text-primary-foreground"
                      disabled={!canSave}
                      onClick={() => existing ? setReplaceConfirmOpen(true) : void save()}
                    >
                      {workState === "uploading" || workState === "saving"
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {workState === "uploading" ? "Uploading…" : "Saving…"}</>
                        : pendingCommit
                          ? "Confirm save"
                          : existing ? "Review and replace" : "Save syllabus"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {pageError && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {pageError}
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {workState === "parsing"
              ? "Reading syllabus"
              : workState === "uploading"
                ? "Uploading syllabus"
                : workState === "saving" ? "Saving syllabus" : ""}
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw_-_2rem)] max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Replace the syllabus information for {classInfo.name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Only the previous syllabus import for this class will be reconciled.</span>
              <span className="block">Manual and Canvas deadlines—and your completion status, notes, and study progress—stay intact.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep reviewing</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => void save()}>{pendingCommit ? "Confirm this save" : "Replace this syllabus"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
