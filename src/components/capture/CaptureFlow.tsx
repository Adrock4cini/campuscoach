import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Mic, Camera, BookOpen, FileUp, StickyNote, MessageSquare, Brain,
  X, ArrowLeft, ArrowRight, Check, Sparkles, Loader2, Calendar,
  ClipboardList, Images, FileText,
} from "lucide-react";
import { classes as demoClasses } from "@/data/demo";
import { detectCurrentClass } from "@/lib/autoClass";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import {
  CAPTURE_LABELS,
  PROCESSING_STEPS,
  commitCapture,
} from "@/lib/capture/processor";
import type {
  CaptureContext,
  CaptureKind,
  CaptureResult,
  ProcessingStep,
} from "@/lib/capture/types";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import {
  filterCaptureTargets,
  validateCaptureImages,
} from "@/lib/capture/imageCapture";

interface Props {
  open: boolean;
  initialKind?: CaptureKind;
  initialClassId?: string;
  onClose: () => void;
}

type Stage = "menu" | "context" | "processing" | "done" | "error";

const MENU: {
  kind: CaptureKind;
  icon: typeof Mic;
  hint: string;
  requiresText?: boolean;
  requiresImages?: boolean;
  availableForRealUsers?: boolean;
  action?: "syllabus";
}[] = [
  { kind: "record-lecture", icon: Mic,           hint: "Audio transcription is coming soon" },
  { kind: "scan-board",     icon: Camera,        hint: "Whiteboard scanning is coming soon" },
  { kind: "scan-textbook",  icon: BookOpen,      hint: "Textbook scanning is coming soon" },
  { kind: "scan-assignment", icon: ClipboardList, hint: "Turn homework into test practice", requiresImages: true, availableForRealUsers: true },
  { kind: "scan-material",   icon: Images,        hint: "Save pages to Class Memory", requiresImages: true, availableForRealUsers: true },
  { kind: "scan-syllabus",   icon: FileText,      hint: "Build classes and calendar", availableForRealUsers: true, action: "syllabus" },
  { kind: "upload-file",    icon: FileUp,        hint: "File processing is coming soon" },
  { kind: "quick-note",     icon: StickyNote,    hint: "Save a typed note", requiresText: true, availableForRealUsers: true },
  { kind: "professor-hint", icon: MessageSquare, hint: "Save what the professor emphasized", requiresText: true, availableForRealUsers: true },
  { kind: "ask-brain",      icon: Brain,         hint: "Campus Brain chat is coming soon", requiresText: true },
];

const REAL_PROCESSING_STEPS: ProcessingStep[] = [
  { id: "queued", label: "Saving your note…", duration: 350 },
  { id: "class-detected", label: "Linked to your class", duration: 300 },
  { id: "concepts-found", label: "Concept extraction queued", duration: 350 },
  { id: "added-to-brain", label: "Added to Class Memory", duration: 300 },
];

const IMAGE_PROCESSING_STEPS: ProcessingStep[] = [
  { id: "queued", label: "Saving private photos…", duration: 350 },
  { id: "class-detected", label: "Checking class and test links", duration: 300 },
  { id: "concepts-found", label: "Reading skills and concepts", duration: 350 },
  { id: "added-to-brain", label: "Adding to Class Memory", duration: 300 },
];

export function CaptureFlow({ open, initialKind, initialClassId, onClose }: Props) {
  const navigate = useNavigate();
  const { user, isDemoMode } = useAuth();
  const {
    classes: myClasses,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const realMode = !!user && !isDemoMode;
  const classes = realMode ? myClasses : demoClasses;

  const [stage, setStage] = useState<Stage>("menu");
  const [kind, setKind] = useState<CaptureKind | null>(null);
  // Auto-class detection is demo-schedule-based, so skip it for real users.
  const detected = useMemo(
    () => (!open || realMode ? null : detectCurrentClass(new Date())),
    [open, realMode],
  );
  const defaultClassId =
    initialClassId ?? detected?.id ?? (!realMode ? classes[0]?.id ?? "" : "");

  const [ctx, setCtx] = useState<CaptureContext>(() => ({
    // Real global capture must never guess a class. A wrong default poisons
    // every downstream concept, artifact, mastery score, and recommendation.
    // Class-scoped entry points still pass initialClassId and stay one-tap.
    classId: defaultClassId,
    date: new Date().toISOString().slice(0, 10),
    topic: detected?.currentTopic ?? "",
    text: "",
  }));

  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const imageKind = kind === "scan-assignment" || kind === "scan-material";
  const {
    items: assignmentItems,
    loading: assignmentsLoading,
  } = useRealAssignments(ctx.classId || "__no-class__", realMode && imageKind);
  const {
    items: examItems,
    loading: examsLoading,
  } = useRealExams(ctx.classId || "__no-class__", realMode && imageKind);
  const captureTargets = useMemo(
    () => filterCaptureTargets(ctx.classId, assignmentItems, examItems),
    [assignmentItems, ctx.classId, examItems],
  );
  const imageValidation = useMemo(() => validateCaptureImages(images), [images]);

  // Reset every open
  useEffect(() => {
    if (!open) return;
    const initialMeta = initialKind ? MENU.find((item) => item.kind === initialKind) : null;
    const canOpenInitial = !!initialKind && (!realMode || initialMeta?.availableForRealUsers);
    setStage(canOpenInitial ? "context" : "menu");
    setKind(canOpenInitial ? initialKind : null);
    setStepIndex(0);
    setResult(null);
    setCaptureError(null);
    setImages([]);
    setCtx({
      classId: defaultClassId,
      date: new Date().toISOString().slice(0, 10),
      topic: detected?.currentTopic ?? "",
      text: "",
    });
  }, [open, initialKind, realMode, defaultClassId, detected?.currentTopic]);

  const meta = kind ? MENU.find((m) => m.kind === kind)! : null;

  const chooseKind = (k: CaptureKind) => {
    const selected = MENU.find((item) => item.kind === k);
    if (selected?.action === "syllabus") {
      onClose();
      navigate("/onboarding?import=syllabus");
      return;
    }
    setKind(k);
    setStage("context");
  };

  const startProcessing = async () => {
    if (!kind) return;
    setStage("processing");
    setStepIndex(0);
    setCaptureError(null);

    // Kick off the commit in parallel with the step animation. Convert a
    // rejection into data immediately so it cannot become an unhandled promise
    // while the progress animation is still running.
    const commitPromise = commitCapture(kind, ctx, {
      simulateDerivedContent: !realMode,
      requireRemotePersistence: realMode,
      attachments: images,
    })
      .then((value) => ({ value, error: null as Error | null }))
      .catch((error: unknown) => ({
        value: null,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    const processingSteps = realMode
      ? (meta?.requiresImages ? IMAGE_PROCESSING_STEPS : REAL_PROCESSING_STEPS)
      : PROCESSING_STEPS;

    for (let i = 0; i < processingSteps.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, processingSteps[i].duration));
    }
    const outcome = await commitPromise;
    if (outcome.error || !outcome.value) {
      setCaptureError(
        outcome.error?.message ?? "We couldn't save this capture. Check your connection and try again.",
      );
      setStage("error");
      return;
    }
    setResult(outcome.value);
    setStage("done");
  };

  const canContinue =
    !!kind &&
    (!realMode || !!meta?.availableForRealUsers) &&
    !classesLoading &&
    classes.some((classInfo) => classInfo.id === ctx.classId) &&
    !!ctx.date &&
    (!meta?.requiresText || (ctx.text?.trim().length ?? 0) > 0) &&
    (!meta?.requiresImages || (
      imageValidation.ok &&
      !assignmentsLoading &&
      !examsLoading &&
      (kind !== "scan-assignment" || !!ctx.assignmentId || !!ctx.assignmentTitle?.trim())
    ));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full sm:max-w-lg max-h-[calc(100dvh-0.5rem)] sm:max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-strong border border-border/60 shadow-elevated"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Aurora accents */}
            <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-3xl sm:rounded-3xl">
              <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-primary/20 blur-[100px]" />
              <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-accent/20 blur-[100px]" />
            </div>

            <div className="relative p-4 sm:p-5 md:p-6">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                {stage !== "menu" && stage !== "done" && (
                  <button
                    onClick={() => (stage === "context" ? setStage("menu") : null)}
                    disabled={stage === "processing"}
                    className="h-8 w-8 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-primary/90">
                    <Sparkles className="h-3 w-3" />
                    Quick Capture
                  </div>
                  <h2 className="font-display text-lg font-semibold text-foreground truncate">
                    {stage === "menu" && "What are you capturing?"}
                    {stage === "context" && meta && CAPTURE_LABELS[meta.kind]}
                    {stage === "processing" && "Campus Brain is working…"}
                    {stage === "done" && (
                      result?.processingStatus === "failed"
                        ? "Saved to Class Memory"
                        : "Added to Campus Brain"
                    )}
                    {stage === "error" && "Capture wasn't saved"}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* MENU */}
              {stage === "menu" && (
                <div>
                  {detected && (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-primary/10 border border-primary/25 text-xs text-foreground/90">
                      Detected class: <span className="font-medium">{detected.name}</span> · {detected.currentTopic}
                    </div>
                  )}
                  {realMode ? (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Capture now
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {MENU.filter((item) => item.availableForRealUsers).map((m) => (
                            <button
                              key={m.kind}
                              onClick={() => chooseKind(m.kind)}
                              className="text-left p-3 rounded-2xl border border-border/50 bg-background/30 hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[92px] flex flex-col"
                            >
                              <m.icon className="h-5 w-5 text-primary mb-1.5" />
                              <p className="text-sm font-medium text-foreground leading-tight">{CAPTURE_LABELS[m.kind]}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{m.hint}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/40 bg-background/20 p-3">
                        <div className="flex items-center justify-between gap-3 mb-2.5">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            Coming next
                          </p>
                          <span className="text-[10px] text-muted-foreground">Not tappable yet</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2" role="list" aria-label="Coming next">
                          {MENU.filter((item) => !item.availableForRealUsers).map((m) => (
                            <div
                              key={m.kind}
                              role="listitem"
                              aria-disabled="true"
                              className="flex items-center gap-2 min-w-0 text-muted-foreground/75"
                            >
                              <m.icon className="h-4 w-4 shrink-0" />
                              <span className="text-xs truncate">{CAPTURE_LABELS[m.kind]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {MENU.map((m) => (
                        <button
                          key={m.kind}
                          onClick={() => chooseKind(m.kind)}
                          className="text-left p-3 rounded-2xl border border-border/50 bg-background/30 hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[84px] flex flex-col"
                        >
                          <m.icon className="h-5 w-5 text-primary mb-1.5" />
                          <p className="text-sm font-medium text-foreground leading-tight">{CAPTURE_LABELS[m.kind]}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{m.hint}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CONTEXT FORM */}
              {stage === "context" && meta && (
                <div className="space-y-3">
                  {classesError && !classesLoading ? (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Class</span>
                      <div className="mt-1">
                        <ClassesLoadError compact onRetry={() => void reloadClasses()} />
                      </div>
                    </div>
                  ) : (
                    <Field label="Class">
                      {classesLoading ? (
                      <div className="h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading your classes…
                      </div>
                    ) : classes.length === 0 ? (
                      <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                        <p className="text-sm text-foreground">Add a class before saving a professor hint.</p>
                        <button
                          type="button"
                          onClick={() => { onClose(); navigate("/onboarding"); }}
                          className="mt-2 text-xs font-medium text-primary"
                        >
                          Set up classes →
                        </button>
                      </div>
                    ) : (
                      <select
                        aria-label="Class"
                        value={ctx.classId}
                        onChange={(e) => {
                          setCtx((c) => ({
                            ...c,
                            classId: e.target.value,
                            assignmentId: undefined,
                            assignmentTitle: undefined,
                            assignmentDueDate: undefined,
                            examId: undefined,
                          }));
                          setImages([]);
                        }}
                        className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground"
                      >
                        {realMode && (
                          <option value="" disabled>Choose a class</option>
                        )}
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      )}
                    </Field>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Date">
                      <div className="relative">
                        <Calendar className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={ctx.date}
                          onChange={(e) => setCtx((c) => ({ ...c, date: e.target.value }))}
                          className="w-full h-11 pl-9 pr-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground"
                        />
                      </div>
                    </Field>
                    <Field label="Topic / Chapter">
                      <input
                        type="text"
                        value={ctx.topic ?? ""}
                        placeholder="Auto-detect if empty"
                        onChange={(e) => setCtx((c) => ({ ...c, topic: e.target.value }))}
                        className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground placeholder:text-muted-foreground/60"
                      />
                    </Field>
                  </div>

                  {meta.requiresText && (
                    <Field label={
                      meta.kind === "quick-note" ? "Note" :
                      meta.kind === "professor-hint" ? "What did the professor say?" :
                      "Your question"
                    }>
                      <textarea
                        value={ctx.text ?? ""}
                        onChange={(e) => setCtx((c) => ({ ...c, text: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground resize-none"
                        placeholder="Type here…"
                      />
                    </Field>
                  )}

                  {meta.requiresImages && (
                    <div className="space-y-3">
                      {meta.kind === "scan-assignment" && (
                        <>
                          <Field label="Assignment">
                            <select
                              aria-label="Assignment"
                              value={ctx.assignmentId ?? ""}
                              onChange={(event) => setCtx((current) => ({
                                ...current,
                                assignmentId: event.target.value || undefined,
                              }))}
                              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground"
                            >
                              <option value="">New assignment</option>
                              {captureTargets.assignments.map((assignment) => (
                                <option key={assignment.id} value={assignment.id}>
                                  {assignment.title}
                                  {assignment.due_date ? ` · due ${assignment.due_date}` : ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {!ctx.assignmentId && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field label="Assignment name">
                                <input
                                  aria-label="Assignment name"
                                  value={ctx.assignmentTitle ?? ""}
                                  onChange={(event) => setCtx((current) => ({
                                    ...current,
                                    assignmentTitle: event.target.value,
                                  }))}
                                  placeholder="Chapter 4 homework"
                                  className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground placeholder:text-muted-foreground/60"
                                />
                              </Field>
                              <Field label="Due date (optional)">
                                <input
                                  aria-label="Due date"
                                  type="date"
                                  value={ctx.assignmentDueDate ?? ""}
                                  onChange={(event) => setCtx((current) => ({
                                    ...current,
                                    assignmentDueDate: event.target.value || undefined,
                                  }))}
                                  className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground"
                                />
                              </Field>
                            </div>
                          )}
                        </>
                      )}

                      <Field label="Preparing for (optional)">
                        <select
                          aria-label="Preparing for"
                          value={ctx.examId ?? ""}
                          onChange={(event) => setCtx((current) => ({
                            ...current,
                            examId: event.target.value || undefined,
                          }))}
                          className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background/40 text-sm text-foreground"
                        >
                          <option value="">No specific test</option>
                          {captureTargets.exams.map((exam) => (
                            <option key={exam.id} value={exam.id}>
                              {exam.title}
                              {exam.exam_date ? ` · ${exam.exam_date}` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <div className="rounded-2xl border border-dashed border-primary/35 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-foreground">
                          {meta.kind === "scan-assignment" ? "Photograph every problem page" : "Photograph notes or book pages"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          1–4 photos. Campus Brain reads the material and keeps the originals private.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
                            <Camera className="h-4 w-4" />
                            Take photo
                            <input
                              aria-label={meta.kind === "scan-assignment" ? "Assignment camera" : "Notes or book camera"}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(event) => {
                                const next = Array.from(event.target.files ?? []);
                                setImages((current) => [...current, ...next]);
                                event.target.value = "";
                              }}
                              className="sr-only"
                            />
                          </label>
                          <label className="h-10 rounded-xl border border-border/60 bg-background/30 text-foreground text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
                            <Images className="h-4 w-4" />
                            Choose photos
                          <input
                            aria-label={meta.kind === "scan-assignment" ? "Assignment photos" : "Notes or book photos"}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                            multiple
                            onChange={(event) => setImages(Array.from(event.target.files ?? []))}
                            className="sr-only"
                          />
                          </label>
                        </div>
                        {images.length > 0 && (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className={`text-xs ${imageValidation.ok ? "text-primary" : "text-danger"}`}>
                              {imageValidation.ok
                                ? `${images.length} ${images.length === 1 ? "photo" : "photos"} ready`
                                : imageValidation.message}
                            </p>
                            <button
                              type="button"
                              onClick={() => setImages([])}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!meta.requiresText && !meta.requiresImages && (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/20 px-4 py-6 text-center text-xs text-muted-foreground">
                      {meta.kind === "record-lecture" && "Tap Start to begin recording (simulated)"}
                      {meta.kind === "scan-board" && "Tap Start to open camera (simulated)"}
                      {meta.kind === "scan-textbook" && "Tap Start to scan pages (simulated)"}
                      {meta.kind === "upload-file" && "Tap Start to pick a file (simulated)"}
                    </div>
                  )}

                  <button
                    onClick={startProcessing}
                    disabled={!canContinue}
                    className="btn-glow w-full h-12 rounded-2xl text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {kind === "scan-assignment"
                      ? "Save assignment"
                      : kind === "scan-material"
                        ? "Add to class"
                        : "Start"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* PROCESSING */}
              {stage === "processing" && (
                <ProcessingTimeline
                  stepIndex={stepIndex}
                  steps={realMode
                    ? (meta?.requiresImages ? IMAGE_PROCESSING_STEPS : REAL_PROCESSING_STEPS)
                    : PROCESSING_STEPS}
                />
              )}

              {/* DONE */}
              {stage === "done" && result && (
                <DoneSummary
                  result={result}
                  className={classes.find((c) => c.id === result.context.classId)?.name}
                  onClose={onClose}
                  onOpenClass={() => {
                    onClose();
                    navigate(`/classes/${result.context.classId}`);
                  }}
                />
              )}

              {/* ERROR */}
              {stage === "error" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {meta?.requiresImages ? "Your photos and choices are still here." : "Your note is still here."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {captureError ?? "We couldn't save it yet. Check your connection and try again."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStage("context")}
                      className="flex-1 h-11 rounded-2xl border border-border/50 bg-background/30 text-sm font-medium text-foreground"
                    >
                      {meta?.requiresImages ? "Review capture" : "Review note"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void startProcessing()}
                      className="btn-glow flex-1 h-11 rounded-2xl text-sm font-medium"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------ subcomponents ------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ProcessingTimeline({ stepIndex, steps }: { stepIndex: number; steps: ProcessingStep[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s: ProcessingStep, i) => {
        const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors",
              state === "done"    && "border-success/30 bg-success/5",
              state === "active"  && "border-primary/40 bg-primary/10",
              state === "pending" && "border-border/40 bg-background/20 opacity-60",
            )}
          >
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
              state === "done"    && "bg-success/20 text-success",
              state === "active"  && "bg-primary/20 text-primary",
              state === "pending" && "bg-background/40 text-muted-foreground",
            )}>
              {state === "done"    && <Check className="h-4 w-4" />}
              {state === "active"  && <Loader2 className="h-4 w-4 animate-spin" />}
              {state === "pending" && <span className="h-2 w-2 rounded-full bg-current opacity-60" />}
            </div>
            <span className="text-sm text-foreground">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DoneSummary({
  result, onClose, onOpenClass, className,
}: {
  result: CaptureResult;
  onClose: () => void;
  onOpenClass: () => void;
  className?: string;
}) {
  const cls = { name: className || "your class" };
  const processingFailed = result.processingStatus === "failed";
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        processingFailed
          ? "border-warning/30 bg-warning/5"
          : "border-success/25 bg-success/5"
      }`}>
        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
          processingFailed ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
        }`}>
          <Check className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Saved to {cls?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {processingFailed
              ? result.processingMessage ?? "Your note is safe, but Campus Brain needs another try."
              : result.summary}
          </p>
        </div>
      </div>

      {processingFailed && (
        <p className="text-xs text-muted-foreground">
          Open the class and tap Retry. Study tools will stay off until the concepts are ready.
        </p>
      )}

      {result.keyConcepts.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">Key concepts</p>
          <div className="flex flex-wrap gap-1.5">
            {result.keyConcepts.map((k) => (
              <span key={k} className="text-[11px] px-2.5 py-1 rounded-full border border-primary/25 bg-primary/10 text-primary">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.flashcardCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {result.flashcardCount} flashcards generated · Campus Brain updated.
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onOpenClass}
          className="flex-1 h-11 rounded-2xl border border-border/50 bg-background/30 text-sm font-medium text-foreground hover:border-primary/40"
        >
          Open class
        </button>
        <button
          onClick={onClose}
          className="btn-glow flex-1 h-11 rounded-2xl text-sm font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}
