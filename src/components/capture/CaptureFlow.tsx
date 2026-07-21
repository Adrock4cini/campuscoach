import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Mic, Camera, BookOpen, FileUp, StickyNote, MessageSquare, Brain,
  X, ArrowLeft, ArrowRight, Check, Sparkles, Loader2, Calendar,
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

interface Props {
  open: boolean;
  initialKind?: CaptureKind;
  initialClassId?: string;
  onClose: () => void;
}

type Stage = "menu" | "context" | "processing" | "done";

const MENU: {
  kind: CaptureKind;
  icon: typeof Mic;
  hint: string;
  requiresText?: boolean;
  availableForRealUsers?: boolean;
}[] = [
  { kind: "record-lecture", icon: Mic,           hint: "Audio transcription is coming soon" },
  { kind: "scan-board",     icon: Camera,        hint: "Whiteboard scanning is coming soon" },
  { kind: "scan-textbook",  icon: BookOpen,      hint: "Textbook scanning is coming soon" },
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

export function CaptureFlow({ open, initialKind, initialClassId, onClose }: Props) {
  const navigate = useNavigate();
  const { user, isDemoMode } = useAuth();
  const { classes: myClasses, loading: classesLoading } = useMyClasses();
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

  // Reset every open
  useEffect(() => {
    if (!open) return;
    const initialMeta = initialKind ? MENU.find((item) => item.kind === initialKind) : null;
    const canOpenInitial = !!initialKind && (!realMode || initialMeta?.availableForRealUsers);
    setStage(canOpenInitial ? "context" : "menu");
    setKind(canOpenInitial ? initialKind : null);
    setStepIndex(0);
    setResult(null);
    setCtx({
      classId: defaultClassId,
      date: new Date().toISOString().slice(0, 10),
      topic: detected?.currentTopic ?? "",
      text: "",
    });
  }, [open, initialKind, realMode, defaultClassId, detected?.currentTopic]);

  const meta = kind ? MENU.find((m) => m.kind === kind)! : null;

  const chooseKind = (k: CaptureKind) => {
    setKind(k);
    setStage("context");
  };

  const startProcessing = async () => {
    if (!kind) return;
    setStage("processing");
    setStepIndex(0);

    // Kick off the real (mock) commit in parallel with the step animation.
    const commitPromise = commitCapture(kind, ctx, { simulateDerivedContent: !realMode });
    const processingSteps = realMode ? REAL_PROCESSING_STEPS : PROCESSING_STEPS;

    for (let i = 0; i < processingSteps.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, processingSteps[i].duration));
    }
    const r = await commitPromise;
    setResult(r);
    setStage("done");
  };

  const canContinue =
    !!kind &&
    (!realMode || !!meta?.availableForRealUsers) &&
    !classesLoading &&
    classes.some((classInfo) => classInfo.id === ctx.classId) &&
    !!ctx.date &&
    (!meta?.requiresText || (ctx.text?.trim().length ?? 0) > 0);

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
                    {stage === "done" && "Added to Campus Brain"}
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
                  <div className="grid grid-cols-2 gap-2">
                    {MENU.map((m) => (
                      <button
                        key={m.kind}
                        onClick={() => chooseKind(m.kind)}
                        disabled={realMode && !m.availableForRealUsers}
                        className="text-left p-3 rounded-2xl border border-border/50 bg-background/30 hover:border-primary/40 hover:bg-primary/5 transition-colors min-h-[84px] flex flex-col disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-background/30"
                      >
                        <m.icon className="h-5 w-5 text-primary mb-1.5" />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-foreground leading-tight">{CAPTURE_LABELS[m.kind]}</p>
                          {realMode && !m.availableForRealUsers && (
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Coming soon</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{m.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CONTEXT FORM */}
              {stage === "context" && meta && (
                <div className="space-y-3">
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
                        onChange={(e) => setCtx((c) => ({ ...c, classId: e.target.value }))}
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

                  {!meta.requiresText && (
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
                    Start
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* PROCESSING */}
              {stage === "processing" && (
                <ProcessingTimeline
                  stepIndex={stepIndex}
                  steps={realMode ? REAL_PROCESSING_STEPS : PROCESSING_STEPS}
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
  const cls = { name: className || demoClasses.find((c) => c.id === result.context.classId)?.name || "your class" };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-success/25 bg-success/5 p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-success/20 text-success flex items-center justify-center shrink-0">
          <Check className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Saved to {cls?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{result.summary}</p>
        </div>
      </div>

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
