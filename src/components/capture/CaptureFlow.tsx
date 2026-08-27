import { useEffect, useMemo, useRef, useState } from "react";
import { assessQuickNoteText } from "@/lib/capture/notePreflight";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Mic, Camera, BookOpen, FileUp, StickyNote, MessageSquare, Brain,
  X, ArrowLeft, ArrowRight, Check, Sparkles, Loader2,
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
  createCaptureAttemptId,
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
  appendCaptureImages,
  CAPTURE_IMAGE_LIMITS,
  filterCaptureTargets,
  validateCaptureImages,
} from "@/lib/capture/imageCapture";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { isPastDateKey, todayDateKey } from "@/lib/calendar/dateKey";
import {
  readLastCaptureClassId,
  writeLastCaptureClassId,
} from "@/lib/capture/captureClassPreference";
import {
  clearCaptureDraft,
  readCaptureDraft,
  writeCaptureDraft,
  type CaptureDraftOwner,
} from "@/lib/capture/captureDraft";
import {
  captureContextLabel,
  inferCaptureClass,
  type CaptureClassInference,
} from "@/lib/capture/captureContextInference";
import { AssignmentProblemReview } from "@/components/assignments/AssignmentProblemReview";
import {
  assignmentPracticeSourceFromUnknown,
  isConfirmedAssignmentPracticeSource,
} from "@/lib/assignments/assignmentPracticeSource";



interface Props {
  open: boolean;
  initialKind?: CaptureKind;
  initialClassId?: string;
  /** Prefilled links from the entry point (assignment "Get help", exam prep). */
  initialAssignmentId?: string;
  initialExamId?: string;
  initialTopic?: string;
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
  { kind: "scan-assignment", icon: ClipboardList, hint: "Save concepts; guided help for percent problems", requiresImages: true, availableForRealUsers: true },
  { kind: "scan-material",   icon: Images,        hint: "Save pages and find the key concepts", requiresImages: true, availableForRealUsers: true },
  { kind: "scan-syllabus",   icon: FileText,      hint: "Choose one class and review its dates", availableForRealUsers: true, action: "syllabus" },
  { kind: "upload-file",    icon: FileUp,        hint: "File processing is coming soon" },
  { kind: "quick-note",     icon: StickyNote,    hint: "Save a typed note", requiresText: true, availableForRealUsers: true },
  { kind: "professor-hint", icon: MessageSquare, hint: "Save what the teacher or instructor emphasized", requiresText: true, availableForRealUsers: true },
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
  { id: "class-detected", label: "Linking to your class", duration: 300 },
  { id: "concepts-found", label: "Reading the pages for concepts", duration: 350 },
  { id: "added-to-brain", label: "Adding concepts to Class Memory", duration: 300 },
];

export function CaptureFlow({
  open,
  initialKind,
  initialClassId,
  initialAssignmentId,
  initialExamId,
  initialTopic,
  onClose,
}: Props) {

  const navigate = useNavigate();
  const { user, isDemoMode } = useAuth();
  const {
    classes: myClasses,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const realMode = !!user && !isDemoMode;
  const captureDraftOwner = useMemo<CaptureDraftOwner>(() => (
    isDemoMode
      ? { mode: "demo" }
      : { mode: "real", userId: user?.id ?? null }
  ), [isDemoMode, user?.id]);
  const classes = realMode ? myClasses : demoClasses;
  const attemptIdRef = useRef<string | null>(null);
  if (!attemptIdRef.current) attemptIdRef.current = createCaptureAttemptId();
  const draftOwnerIdRef = useRef<string | null>(realMode ? user?.id ?? null : null);

  const [stage, setStage] = useState<Stage>("menu");
  const [kind, setKind] = useState<CaptureKind | null>(null);
  // Auto-class detection is demo-schedule-based, so skip it for real users.
  const detected = useMemo(
    () => (!open || realMode ? null : detectCurrentClass(new Date())),
    [open, realMode],
  );
  // A remembered class is only ever reused when it is still one of the
  // student's own classes, so a deleted class can never poison a capture.
  const rememberedClassId = useMemo(
    () =>
      open && realMode && !classesLoading
        ? readLastCaptureClassId({ allowedClassIds: classes.map((item) => item.id) })
        : null,
    [classes, classesLoading, open, realMode],
  );
  // Zero-form capture: infer the class before asking anything, and only ever
  // ask when the evidence is genuinely ambiguous.
  const inference = useMemo<CaptureClassInference | null>(() => {
    if (!open) return null;
    if (!realMode) {
      const demoId = initialClassId ?? detected?.id ?? classes[0]?.id ?? "";
      return {
        classId: demoId,
        source: initialClassId ? "entry" : detected?.id ? "schedule" : "only-class",
        confidence: "high",
        needsClass: !demoId,
      };
    }
    if (classesLoading) return null;
    return inferCaptureClass({
      entryClassId: initialClassId,
      rememberedClassId,
      classes,
    });
  }, [classes, classesLoading, detected?.id, initialClassId, open, realMode, rememberedClassId]);
  const defaultClassId = inference?.classId ?? "";




  const [ctx, setCtx] = useState<CaptureContext>(() => ({
    // Real global capture must never guess a class. A wrong default poisons
    // every downstream concept, artifact, mastery score, and recommendation.
    // Class-scoped entry points still pass initialClassId and stay one-tap.
    classId: defaultClassId,
    date: todayDateKey(),
    topic: detected?.currentTopic ?? "",
    text: "",
  }));

  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Forms are correction, not the default: details stay collapsed behind
  // "Change" until the student says the inferred context is wrong.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [classChangedManually, setClassChangedManually] = useState(false);
  // A restored draft can carry the fact that photos were pending. The files
  // themselves are in-memory and cannot survive an iOS tab reload, so we say so.
  const [photosNeedRetake, setPhotosNeedRetake] = useState(false);


  const [imageSelection, setImageSelection] = useState<{
    files: File[];
    rejectedCount: number;
  }>({ files: [], rejectedCount: 0 });
  const images = imageSelection.files;
  const imageKind = kind === "scan-assignment" || kind === "scan-material";
  const {
    items: assignmentItems,
    loading: assignmentsLoading,
  } = useRealAssignments(ctx.classId || "__no-class__", realMode && imageKind);
  const {
    items: examItems,
    loading: examsLoading,
  } = useRealExams(ctx.classId || "__no-class__", realMode && imageKind);
  const captureTargets = useMemo(() => {
    const targets = filterCaptureTargets(ctx.classId, assignmentItems, examItems);
    return {
      ...targets,
      exams: targets.exams.filter((exam) => !isPastDateKey(exam.exam_date)),
    };
  }, [assignmentItems, ctx.classId, examItems]);
  const imageValidation = useMemo(() => validateCaptureImages(images), [images]);
  const imageLimitReached = images.length >= CAPTURE_IMAGE_LIMITS.maxFiles;

  // Reset only when the sheet actually opens. Anything that changes while the
  // student is mid-capture (classes finishing loading, a re-render from a
  // parent) must never wipe their photos, note text, or class choice.
  const wasOpenRef = useRef(false);
  const openedWithKindRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    attemptIdRef.current = createCaptureAttemptId();
    draftOwnerIdRef.current = realMode ? user?.id ?? null : null;
    const initialMeta = initialKind ? MENU.find((item) => item.kind === initialKind) : null;
    const canOpenInitial = !!initialKind && (!realMode || initialMeta?.availableForRealUsers);
    openedWithKindRef.current = Boolean(canOpenInitial);

    // A draft interrupted by app switching, a phone call, or an iOS tab reload
    // comes back exactly as it was. Photos are in-memory files and cannot be
    // restored, so the flow simply re-asks for them.
    const draft = readCaptureDraft({
      owner: captureDraftOwner,
      allowedClassIds: classes.map((item) => item.id),
    });
    const draftMeta = draft ? MENU.find((item) => item.kind === draft.kind) : null;
    const exactEntryScope = Boolean(
      draft
      && (!initialClassId || draft.classId === initialClassId)
      && (!initialAssignmentId || draft.assignmentId === initialAssignmentId)
      && (!initialExamId || draft.examId === initialExamId)
      && (!initialTopic || draft.topic === initialTopic),
    );
    const restorable = Boolean(
      draft && draftMeta && (!realMode || draftMeta.availableForRealUsers)
      && (!canOpenInitial || draft!.kind === initialKind)
      && exactEntryScope,
    );

    setStage(canOpenInitial || restorable ? "context" : "menu");
    setKind(canOpenInitial ? initialKind! : restorable ? draft!.kind : null);
    setStepIndex(0);
    setResult(null);
    setCaptureError(null);
    setImageSelection({ files: [], rejectedCount: 0 });
    setPhotosNeedRetake(Boolean(restorable && draft!.hadPhotos));

    setDetailsOpen(false);
    setClassChangedManually(false);

    const restoredClassId = restorable
      ? (inference?.source === "entry" && defaultClassId
        ? defaultClassId
        : draft!.classId || defaultClassId)
      : defaultClassId;
    // A retained assignment/test belongs to the retained class. If the student
    // deliberately opened capture from a different class, do not leak the old
    const canRestoreDraftTargets = Boolean(
      restorable && draft!.classId && draft!.classId === restoredClassId,
    );

    setCtx(restorable
      ? {
        // An explicit entry class (opened from a class page or a class action)
        // always wins over a retained draft from a previous class, so Quick
        // Capture from BIOL can never preselect last session's class.
        classId: restoredClassId,
        date: draft!.date || todayDateKey(),
        topic: draft!.topic,
        text: draft!.text,
        assignmentId: initialAssignmentId
          ?? (canRestoreDraftTargets ? draft!.assignmentId : undefined),
        assignmentTitle: canRestoreDraftTargets ? draft!.assignmentTitle : undefined,
        assignmentDueDate: canRestoreDraftTargets ? draft!.assignmentDueDate : undefined,
        examId: initialExamId
          ?? (canRestoreDraftTargets ? draft!.examId : undefined),
      }

      : {
        classId: defaultClassId,
        date: todayDateKey(),
        topic: initialTopic ?? detected?.currentTopic ?? "",
        text: "",
        // Entry points that already know the target (Assignment → "Get help",
        // Test → "Add material") pre-link it so the work lands on the right
        // assignment/test without the student re-selecting anything.
        assignmentId: initialAssignmentId,
        examId: initialExamId,
      });
  }, [
    inference?.source,

    open,
    initialKind,
    realMode,
    defaultClassId,
    detected?.currentTopic,
    user?.id,
    classes,
    initialClassId,
    initialAssignmentId,
    initialExamId,
    initialTopic,
    captureDraftOwner,
  ]);


  // Once photos are back, drop the "re-take" notice.
  useEffect(() => {
    if (images.length > 0) setPhotosNeedRetake(false);
  }, [images.length]);

  // Keep the draft warm while the student is actually composing something.

  useEffect(() => {
    if (!open || !kind || stage !== "context") return;
    const activeOwnerId = realMode ? user?.id ?? null : null;
    if (draftOwnerIdRef.current !== activeOwnerId) return;
    writeCaptureDraft({
      kind,
      classId: ctx.classId,
      date: ctx.date,
      topic: ctx.topic ?? "",
      text: ctx.text ?? "",
      assignmentId: ctx.assignmentId,
      assignmentTitle: ctx.assignmentTitle,
      assignmentDueDate: ctx.assignmentDueDate,
      examId: ctx.examId,
      hadPhotos: images.length > 0,
    }, { owner: captureDraftOwner });
  }, [
    open,
    kind,
    stage,
    ctx.classId,
    ctx.date,
    ctx.topic,
    ctx.text,
    ctx.assignmentId,
    ctx.assignmentTitle,
    ctx.assignmentDueDate,
    ctx.examId,
    images.length,
    captureDraftOwner,
    realMode,
    user?.id,
  ]);

  // Fill (never overwrite) the class once it becomes known — from the default
  // for this entry point, or from the student's last capture so the habit of
  // "open Campus Coach in class" stays a one-tap action.
  useEffect(() => {
    if (!open) return;
    const fill = defaultClassId || rememberedClassId;
    if (!fill) return;
    setCtx((current) => (current.classId ? current : { ...current, classId: fill }));
  }, [defaultClassId, open, rememberedClassId]);




  const meta = kind ? MENU.find((m) => m.kind === kind)! : null;

  const activeClass = classes.find((item) => item.id === ctx.classId) ?? null;
  const classesReady = !classesLoading && !classesError;
  // The one question we ever ask up front, and only when nothing reliable
  // points at a single class.
  const needsClassAnswer = classesReady && classes.length > 0 && !ctx.classId;
  const contextSource =
    classChangedManually || !inference || inference.classId !== ctx.classId
      ? "manual"
      : inference.source;
  const contextLabel = captureContextLabel({
    className: activeClass?.name,
    dateKey: ctx.date,
    todayKey: todayDateKey(),
    topic: ctx.topic,
  });


  const requestClose = () => {
    if (stage !== "processing") onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (stage === "processing") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onClose, open, stage]);

  const chooseKind = (k: CaptureKind) => {
    const selected = MENU.find((item) => item.kind === k);
    if (selected?.action === "syllabus") {
      onClose();
      navigate("/classes?intent=syllabus");
      return;
    }
    // Coming back to the same capture keeps the draft (photos, note, class).
    // Switching to a different capture drops photos that no longer apply.
    if (kind !== k) {
      attemptIdRef.current = createCaptureAttemptId();
      setImageSelection({ files: [], rejectedCount: 0 });
    }
    draftOwnerIdRef.current = realMode ? user?.id ?? null : null;
    setKind(k);
    setStage("context");
  };


  const startProcessing = async () => {
    if (!kind) return;
    const ownerId = realMode ? user?.id : undefined;
    const attemptId = attemptIdRef.current ?? createCaptureAttemptId();
    attemptIdRef.current = attemptId;
    if (realMode && (!ownerId || draftOwnerIdRef.current !== ownerId)) return;
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
      attemptId,
      ownerId,
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
      if (realMode && draftOwnerIdRef.current !== ownerId) return;
    }
    const outcome = await commitPromise;
    if (realMode && draftOwnerIdRef.current !== ownerId) return;
    if (outcome.error || !outcome.value) {
      setCaptureError(
        outcome.error?.message ?? "We couldn't save this capture. Check your connection and try again.",
      );
      setStage("error");
      return;
    }
    if (realMode && outcome.value.context.classId) {
      writeLastCaptureClassId(outcome.value.context.classId);
    }
    // The draft is now a saved capture; nothing left to restore.
    clearCaptureDraft();
    setResult(outcome.value);
    setStage("done");

  };

  // Deterministic junk check: keeps obviously unusable notes out of the AI path
  // without rejecting short but real facts.
  const notePreflight = meta?.requiresText
    ? assessQuickNoteText(ctx.text ?? "")
    : ({ usable: true } as const);

  const canContinue =
    !!kind &&
    (!realMode || !!meta?.availableForRealUsers) &&
    !classesLoading &&
    classes.some((classInfo) => classInfo.id === ctx.classId) &&
    !!ctx.date &&
    (!meta?.requiresText || notePreflight.usable) &&
    (kind !== "scan-assignment" || !!ctx.assignmentId || !!ctx.assignmentTitle?.trim()) &&
    (!meta?.requiresImages || (
      imageValidation.ok &&
      !assignmentsLoading &&
      !examsLoading
    ));


  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="capture-backdrop fixed inset-0 z-[80] flex max-w-[100dvw] touch-pan-y items-end justify-center overflow-x-hidden overscroll-contain bg-black/60 backdrop-blur-md sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={requestClose}
        >
          <motion.div
            data-testid="capture-sheet"
            className="capture-sheet relative box-border max-h-[calc(100dvh-0.5rem)] w-full max-w-[100dvw] min-w-0 overflow-x-hidden overflow-y-auto rounded-t-3xl border border-border/60 glass-strong shadow-elevated sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl"
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

            <div className="relative min-w-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:p-6">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                {stage !== "menu" && stage !== "done" && (
                  <button
                    onClick={() => {
                      // Opened straight into one capture type: there is no
                      // previous step, so Back closes instead of dropping the
                      // student into a menu they never saw.
                      if (stage === "context") {
                        if (openedWithKindRef.current) requestClose();
                        else setStage("menu");
                      }
                      if (stage === "error") setStage("context");
                    }}
                    disabled={stage === "processing"}
                    className="h-11 w-11 shrink-0 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-primary/90">
                    <Sparkles className="h-3 w-3" />
                    Add from class
                  </div>
                  <h2 className="font-display text-lg font-semibold text-foreground truncate">
                    {stage === "menu" && "What do you want to add?"}
                    {stage === "context" && meta && CAPTURE_LABELS[meta.kind]}
                    {stage === "processing" && "Campus Brain is working…"}
                    {stage === "done" && (
                      !realMode
                        ? "Saved in this demo"
                        : result?.processingStatus === "failed"
                        ? "Saved to Class Memory"
                        : "Added to Campus Brain"
                    )}
                    {stage === "error" && "Capture wasn't saved"}
                  </h2>
                </div>
                <button
                  onClick={requestClose}
                  disabled={stage === "processing"}
                  className="h-11 w-11 shrink-0 rounded-full border border-border/40 bg-background/30 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
                              className="flex min-h-[92px] touch-manipulation flex-col rounded-2xl border border-border/50 bg-background/30 p-3 text-left transition-[transform,border-color,background-color] active:scale-[0.985] hover:border-primary/40 hover:bg-primary/5"
                            >
                              <m.icon className="h-5 w-5 text-primary mb-1.5" />
                              <p className="text-sm font-medium text-foreground leading-tight">{CAPTURE_LABELS[m.kind]}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{m.hint}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Locked roadmap items are intentionally not advertised in the
                          primary capture sheet. The components/routes still exist; they
                          are surfaced again once they actually work for students. */}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {MENU.map((m) => (
                        <button
                          key={m.kind}
                          onClick={() => chooseKind(m.kind)}
                          className="flex min-h-[84px] touch-manipulation flex-col rounded-2xl border border-border/50 bg-background/30 p-3 text-left transition-[transform,border-color,background-color] active:scale-[0.985] hover:border-primary/40 hover:bg-primary/5"
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
                <div className="min-w-0 space-y-3">
                  {classesError && !classesLoading ? (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Class</span>
                      <div className="mt-1">
                        <ClassesLoadError compact onRetry={() => void reloadClasses()} />
                      </div>
                    </div>
                  ) : classesLoading ? (
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading your classes…
                    </div>
                  ) : classes.length === 0 ? (
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                      <p className="text-sm text-foreground">Add a class before saving this capture.</p>
                      <button
                        type="button"
                        onClick={() => { onClose(); navigate("/classes/new"); }}
                        className="mt-2 text-xs font-medium text-primary"
                      >
                        Set up classes →
                      </button>
                    </div>
                  ) : needsClassAnswer ? (
                    /* The single question. One tap answers it — no form. */
                    <div
                      className="rounded-2xl border border-primary/30 bg-primary/5 p-3"
                      data-testid="capture-class-question"
                    >
                      <p className="text-sm font-medium text-foreground">Which class is this for?</p>
                      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Which class is this for?">
                        {classes.map((classInfo) => (
                          <button
                            key={classInfo.id}
                            type="button"
                            onClick={() => {
                              setCtx((current) => ({ ...current, classId: classInfo.id }));
                              setClassChangedManually(true);
                            }}
                            className="inline-flex min-h-11 touch-manipulation items-center rounded-xl border border-border/60 bg-background/40 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                          >
                            {classInfo.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* High/medium confidence: a compact chip, not a form. */
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/40 px-3 py-2">
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-medium text-foreground"
                          data-testid="capture-context-chip"
                        >
                          {contextLabel}
                        </p>
                        {contextSource === "schedule" && (
                          <p className="text-[11px] text-muted-foreground">
                            Looks like the class you're in right now.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((value) => !value)}
                        aria-expanded={detailsOpen}
                        className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-xs font-medium text-primary hover:underline"
                      >
                        {detailsOpen ? "Done" : "Change"}
                      </button>
                    </div>
                  )}

                  {detailsOpen && classesReady && classes.length > 0 && (
                    <div className="space-y-3 rounded-2xl border border-border/50 bg-background/20 p-3">
                      <Field label="Class">
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
                            setClassChangedManually(true);
                          }}
                          className="h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-base text-foreground sm:text-sm"
                        >
                          {realMode && (
                            <option value="" disabled>Choose a class</option>
                          )}
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DatePickerField
                          id="capture-date"
                          label="Capture date"
                          value={ctx.date}
                          onChange={(date) => setCtx((current) => ({ ...current, date }))}
                        />
                        <Field label="Topic / Chapter (optional)">
                          <input
                            type="text"
                            value={ctx.topic ?? ""}
                            placeholder="Campus Coach reads this from the material"
                            onChange={(e) => setCtx((c) => ({ ...c, topic: e.target.value }))}
                            className="h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-base text-foreground placeholder:text-muted-foreground/60 sm:text-sm"
                          />
                        </Field>
                      </div>
                      {meta.requiresImages && (
                        <>
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
                                  className="h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-base text-foreground sm:text-sm"
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
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Field label="Assignment name (required)">
                                    <input
                                      aria-label="Assignment name"
                                      value={ctx.assignmentTitle ?? ""}
                                      maxLength={300}
                                      onChange={(event) => setCtx((current) => ({
                                        ...current,
                                        assignmentTitle: event.target.value,
                                      }))}
                                      placeholder="e.g., Chapter 4 homework"
                                      className="h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-base text-foreground placeholder:text-muted-foreground/60 sm:text-sm"
                                    />
                                  </Field>
                                  <DatePickerField
                                    id="captured-assignment-due-date"
                                    label="Due date"
                                    value={ctx.assignmentDueDate ?? ""}
                                    onChange={(assignmentDueDate) => setCtx((current) => ({
                                      ...current,
                                      assignmentDueDate: assignmentDueDate || undefined,
                                    }))}
                                  />
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
                              className="h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-base text-foreground sm:text-sm"
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
                        </>
                      )}
                    </div>
                  )}


                  {meta.requiresText && (
                    <Field label={
                      meta.kind === "quick-note" ? "Note" :
                      meta.kind === "professor-hint" ? "What did the teacher or instructor say?" :
                      "Your question"
                    }>
                      <textarea
                        value={ctx.text ?? ""}
                        onChange={(e) => setCtx((c) => ({ ...c, text: e.target.value }))}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-border/50 bg-background/40 px-3 py-2.5 text-base text-foreground sm:text-sm"
                        placeholder="Type here…"
                      />
                    </Field>
                  )}

                  {meta.requiresImages && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-dashed border-primary/35 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-foreground">
                          {meta.kind === "scan-assignment" ? "Photograph one problem" : "Photograph notes or book pages"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {meta.kind === "scan-assignment"
                            ? "Guided walkthroughs currently cover one percent-of or percent-discount problem. Other photos still save concepts for class study. Get close enough to read every number and symbol."
                            : "Add up to 4 pages to this one capture — one class and date covers all of them. Campus Brain keeps the originals private."}

                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label
                            aria-disabled={imageLimitReached}
                            className={cn(
                              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-medium text-primary-foreground ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                              imageLimitReached
                                ? "pointer-events-none cursor-not-allowed opacity-50"
                                : "cursor-pointer",
                            )}
                          >
                            <Camera className="h-4 w-4" />
                            Take photo
                            <input
                              aria-label={meta.kind === "scan-assignment" ? "Take photo — assignment" : "Take photo — notes or book"}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={imageLimitReached}
                              onChange={(event) => {
                                const next = Array.from(event.currentTarget.files ?? []);
                                if (next.length > 0) {
                                  setImageSelection((current) => appendCaptureImages(current.files, next));
                                }
                                event.currentTarget.value = "";
                              }}
                              className="sr-only"
                            />
                          </label>
                          <label
                            aria-disabled={imageLimitReached}
                            className={cn(
                              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/30 text-xs font-medium text-foreground ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                              imageLimitReached
                                ? "pointer-events-none cursor-not-allowed opacity-50"
                                : "cursor-pointer",
                            )}
                          >
                            <Images className="h-4 w-4" />
                            Choose photos
                            <input
                              aria-label={meta.kind === "scan-assignment" ? "Choose photos — assignment" : "Choose photos — notes or book"}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                              multiple
                              disabled={imageLimitReached}
                              onChange={(event) => {
                                const next = Array.from(event.currentTarget.files ?? []);
                                if (next.length > 0) {
                                  setImageSelection((current) => appendCaptureImages(current.files, next));
                                }
                                event.currentTarget.value = "";
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                        {photosNeedRetake && images.length === 0 && (
                          <p
                            role="status"
                            aria-live="polite"
                            className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground"
                          >
                            Your class, date, topic, and notes came back. Photos can't be saved by the
                            phone when the tab reloads — take or choose them again and you're set.
                          </p>
                        )}
                        {images.length > 0 && (

                          <div className="mt-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2" role="list" aria-label="Selected photos">
                              {images.map((file, index) => (
                                <CapturePhotoPreview
                                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                                  file={file}
                                  index={index}
                                  onRemove={() => setImageSelection((current) => ({
                                    files: current.files.filter((_, currentIndex) => currentIndex !== index),
                                    rejectedCount: 0,
                                  }))}
                                />
                              ))}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className="min-w-0 flex-1 text-xs"
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                              >
                                <p className={imageValidation.ok ? "text-primary" : "text-danger"}>
                                  {imageValidation.ok
                                    ? `${images.length} of ${CAPTURE_IMAGE_LIMITS.maxFiles} ${images.length === 1 ? "photo" : "photos"} ready`
                                    : `${images.length} of ${CAPTURE_IMAGE_LIMITS.maxFiles} selected. ${imageValidation.message}`}
                                </p>
                                {imageSelection.rejectedCount > 0 && (
                                  <p className="mt-1 text-warning">
                                    Only {CAPTURE_IMAGE_LIMITS.maxFiles} photos can be added at once. {imageSelection.rejectedCount}{" "}
                                    {imageSelection.rejectedCount === 1 ? "photo wasn't" : "photos weren't"} added.
                                    Save these {CAPTURE_IMAGE_LIMITS.maxFiles}, then start another capture.
                                  </p>
                                )}
                                {imageLimitReached && imageSelection.rejectedCount === 0 && (
                                  <p className="mt-1 text-muted-foreground">Remove one to replace it.</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setImageSelection({ files: [], rejectedCount: 0 })}
                                className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                Remove all photos
                              </button>
                            </div>
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

                  {kind === "scan-assignment"
                    && !ctx.assignmentId
                    && !ctx.assignmentTitle?.trim()
                    && !detailsOpen && (
                      <button
                        type="button"
                        onClick={() => setDetailsOpen(true)}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-warning/35 bg-warning/5 px-3 text-sm font-medium text-foreground hover:border-primary/40"
                      >
                        Choose an assignment or add its name
                      </button>
                    )}

                  <button
                    onClick={startProcessing}
                    disabled={!canContinue}
                    className="btn-glow inline-flex h-12 w-full touch-manipulation items-center justify-center gap-1.5 rounded-2xl text-sm font-medium transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
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
                  expectation={realMode && meta?.requiresImages
                    ? "Clear photos usually finish in about 15–30 seconds."
                    : undefined}
                />
              )}

              {/* DONE */}
              {stage === "done" && result && (
                <CaptureDoneSummary
                  result={result}
                  sample={!realMode}
                  className={classes.find((c) => c.id === result.context.classId)?.name}
                  onClose={requestClose}
                  onOpenClass={() => {
                    requestClose();
                    navigate(`/classes/${result.context.classId}`);
                  }}
                  onRetryProcessing={
                    realMode && result.processingStatus === "failed" && result.captureId
                      ? async () => {
                          const captureId = result.captureId!;
                          const {
                            retryCaptureConceptsWithResult,
                            retryCaptureImagesWithResult,
                          } = await import(
                            "@/lib/supabase/capturePersistence"
                          );
                          const processing = result.materialIds?.length
                            ? await retryCaptureImagesWithResult(captureId, result.materialIds)
                            : await retryCaptureConceptsWithResult({
                              id: captureId,
                              kind: result.kind,
                              clientClassId: result.context.classId,
                              topic: result.context.topic ?? null,
                              rawText: result.context.text ?? null,
                            });
                          setResult((current) => current ? {
                            ...current,
                            processingStatus: processing.processingStatus,
                            processingMessage: undefined,
                            ...(processing.practiceSource
                              ? { practiceSource: processing.practiceSource }
                              : {}),
                          } : current);
                        }
                      : undefined
                  }
                  onPractice={
                    realMode &&
                    (result.processingStatus ?? "ready") === "ready" &&
                    result.context.classId &&
                    result.captureId &&
                    (result.kind !== "scan-assignment" || result.context.assignmentId)
                      ? () => {
                          requestClose();
                          const params = new URLSearchParams({
                            classId: result.context.classId,
                            captureId: result.captureId!,
                          });
                          if (result.kind === "scan-assignment") {
                            params.set("assignmentId", result.context.assignmentId!);
                            params.set("format", "practice");
                            params.set("intent", "assignment-help");
                          } else {
                            params.set("format", "flashcards");
                          }
                          navigate(`/study-lab?${params.toString()}`);
                        }
                      : undefined
                  }

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

function CapturePhotoPreview({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/40" role="listitem">
      <div className="flex aspect-[4/3] items-center justify-center bg-background/60">
        {previewUrl && !previewFailed ? (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <Images className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/85 px-1.5 py-1 text-[10px] font-medium text-foreground backdrop-blur-sm">
        Photo {index + 1}
      </span>
      <button
        type="button"
        aria-label={`Remove photo ${index + 1}`}
        onClick={onRemove}
        className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/90 text-muted-foreground shadow-sm ring-offset-background transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <div className="mt-1 min-w-0">{children}</div>
    </label>
  );
}

function ProcessingTimeline({
  stepIndex,
  steps,
  expectation,
}: {
  stepIndex: number;
  steps: ProcessingStep[];
  expectation?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
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
      {expectation && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {expectation}
        </p>
      )}
    </div>
  );
}

export function CaptureDoneSummary({
  result, sample, onClose, onOpenClass, onPractice, onRetryProcessing, className,
}: {
  result: CaptureResult;
  sample: boolean;
  onClose: () => void;
  onOpenClass: () => void;
  /** Retry AI processing in place — no trip through the class page. */
  onRetryProcessing?: () => Promise<void>;
  /** One compact next action. Omitted when there is nothing safe to study yet. */
  onPractice?: () => void;
  className?: string;
}) {

  const cls = { name: className || "your class" };
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [practiceSource, setPracticeSource] = useState(() => (
    assignmentPracticeSourceFromUnknown(result.practiceSource, result.kind)
  ));
  useEffect(() => {
    setPracticeSource(assignmentPracticeSourceFromUnknown(result.practiceSource, result.kind));
  }, [result.id, result.kind, result.practiceSource]);
  const processingFailed = result.processingStatus === "failed";
  const stillProcessing = !sample && result.processingStatus === "processing";
  const assignmentReadyForReview = Boolean(
    !sample
    && result.kind === "scan-assignment"
    && result.processingStatus === "ready"
    && result.captureId
    && result.context.assignmentId
    && result.context.classId,
  );
  const canPractice = Boolean(
    onPractice
    && (result.kind !== "scan-assignment" || isConfirmedAssignmentPracticeSource(practiceSource)),
  );
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
          <p className="text-sm font-medium text-foreground">
            {sample ? `Saved in this demo for ${cls.name}` : `Saved to ${cls.name}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sample
              ? "Stored on this device for the demo only. It wasn’t uploaded or shared."
              : processingFailed
              ? result.processingMessage ?? "Your note is safe, but Campus Brain needs another try."
              : result.summary}
          </p>
        </div>
      </div>

      {processingFailed && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Study tools stay off until the concepts are ready.
          </p>
          {onRetryProcessing && (
            <button
              type="button"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                setRetryError(null);
                try {
                  await onRetryProcessing();
                } catch (error) {
                  setRetryError(
                    error instanceof Error
                      ? error.message
                      : "That didn't work. Your capture is still saved — try again in a moment.",
                  );
                } finally {
                  setRetrying(false);
                }
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-border px-4 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {retrying ? "Trying again…" : "Retry processing"}
            </button>
          )}
          {retryError && <p className="text-xs text-danger">{retryError}</p>}
        </div>
      )}

      {stillProcessing && (
        <p role="status" className="text-xs text-muted-foreground">
          Campus Brain is still reading this. Study material isn’t ready yet — open the class in a
          minute to practice it.
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
          {sample
            ? `${result.flashcardCount} sample flashcards created for this demo.`
            : `${result.flashcardCount} flashcards generated · Campus Brain updated.`}
        </div>
      )}

      {assignmentReadyForReview && (
        <AssignmentProblemReview
          captureId={result.captureId!}
          assignmentId={result.context.assignmentId!}
          classId={result.context.classId}
          source={practiceSource}
          onFallback={onOpenClass}
          onConfirmed={setPracticeSource}
        />
      )}

      {canPractice ? (
        <div className="space-y-2 pt-1">
          {result.kind === "scan-assignment" && (
            <p className="text-xs text-muted-foreground">
              Start with a hint, then work a different example and a similar percent problem.
            </p>
          )}
          <button
            onClick={onPractice}
            className="btn-glow inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-medium"
          >
            <Sparkles className="h-4 w-4" />
            {result.kind === "scan-assignment" ? "Start percent walkthrough" : "Practice this now"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onOpenClass}
              className="h-11 flex-1 rounded-2xl border border-border/50 bg-background/30 text-sm font-medium text-foreground hover:border-primary/40"
            >
              Open class
            </button>
            <button
              onClick={onClose}
              className="h-11 flex-1 rounded-2xl border border-border/50 bg-background/30 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Save for later
            </button>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );

}
