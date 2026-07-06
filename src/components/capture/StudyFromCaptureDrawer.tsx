/**
 * Study From Capture — short, focused study session generated on the
 * fly from a captured note/scan/recording.
 *
 * Stages:
 *   1. preview  — show summary + concepts + recommended mode
 *   2. running  — one screen per item (flip cards, quiz, practice, explain)
 *   3. done     — completion summary + follow-up actions
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  buildStudySessionFromCapture,
  STUDY_MODE_LABEL,
  type StudyMode,
  type StudySession,
} from "@/lib/study/studyFromCapture";
import type { MemoryItem } from "@/components/capture/CaptureDetailDrawer";
import { contributeStudySignal } from "@/hooks/useClassIntelligence";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MemoryItem | null;
  classId: string;
  className?: string;
  initialMode?: StudyMode;
}

type Stage = "preview" | "running" | "done";

export function StudyFromCaptureDrawer({
  open,
  onOpenChange,
  item,
  classId,
  className,
  initialMode,
}: Props) {
  const [stage, setStage] = useState<Stage>("preview");
  const [modeOverride, setModeOverride] = useState<StudyMode | undefined>(
    initialMode,
  );
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setModeOverride(initialMode);
    } else {
      // reset when closed
      setStage("preview");
      setModeOverride(undefined);
      setStep(0);
      setRevealed(false);
      setCorrect(0);
      setAnswered(0);
    }
  }, [open, initialMode]);

  const session: StudySession | null = useMemo(
    () => (item ? buildStudySessionFromCapture(item, classId, modeOverride) : null),
    [item, classId, modeOverride],
  );

  if (!item || !session) return null;

  const items = pickItems(session);
  const total = items.length;
  const current = items[step];
  const progress = total ? Math.round(((step + (stage === "done" ? 1 : 0)) / total) * 100) : 0;

  const next = () => {
    setRevealed(false);
    if (step + 1 >= total) finish();
    else setStep((s) => s + 1);
  };

  const finish = () => {
    setStage("done");
    // Feed the Student Model with a lightweight study signal.
    void contributeStudySignal({
      classId,
      topicId: session.topic,
      topicName: session.topic,
      timeSpentMinutes: session.estimatedMinutes,
      accuracy: answered > 0 ? Math.round((correct / answered) * 100) : undefined,
      sourceType: `study-from-capture:${session.mode}`,
      sourceId: item.id,
    }).catch(() => undefined);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Study from capture</span>
            <span>·</span>
            <span>{className ?? "This class"}</span>
          </div>
          <SheetTitle className="font-display text-xl">{session.topic}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> ~{session.estimatedMinutes} min ·{" "}
            {STUDY_MODE_LABEL[session.mode]}
          </SheetDescription>
        </SheetHeader>

        {stage === "preview" && (
          <PreviewStage
            session={session}
            onStart={() => setStage("running")}
            onChangeMode={(m) => setModeOverride(m)}
          />
        )}

        {stage === "running" && current && (
          <RunningStage
            session={session}
            step={step}
            total={total}
            progress={progress}
            item={current}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onAnswer={(isCorrect) => {
              setAnswered((a) => a + 1);
              if (isCorrect) setCorrect((c) => c + 1);
              setRevealed(true);
            }}
            onNext={next}
          />
        )}

        {stage === "done" && (
          <DoneStage
            session={session}
            correct={correct}
            answered={answered}
            onRestart={() => {
              setStage("preview");
              setStep(0);
              setRevealed(false);
              setCorrect(0);
              setAnswered(0);
            }}
            onGoLab={() => {
              onOpenChange(false);
              navigate(
                `/study-lab?classId=${classId}&topic=${encodeURIComponent(session.topic)}`,
              );
            }}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

function PreviewStage({
  session,
  onStart,
  onChangeMode,
}: {
  session: StudySession;
  onStart: () => void;
  onChangeMode: (m: StudyMode) => void;
}) {
  const modes: StudyMode[] = ["flashcards", "quiz", "practice", "explain"];
  return (
    <div className="mt-6 space-y-5">
      {/* Campus Brain pick */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-1 text-primary text-xs font-medium">
          <Brain className="h-3.5 w-3.5" /> Campus Brain recommends
        </div>
        <p className="text-sm font-medium text-foreground">
          {STUDY_MODE_LABEL[session.mode]}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{session.reason}</p>
      </div>

      {/* Summary */}
      {session.summary && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            From your capture
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {session.summary}
          </p>
        </div>
      )}

      {/* Key concepts */}
      {session.keyConcepts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Key concepts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {session.keyConcepts.map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="text-xs border-primary/20 text-primary"
              >
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Start */}
      <Button
        size="lg"
        className="w-full bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
        onClick={onStart}
      >
        Start · {STUDY_MODE_LABEL[session.mode]}{" "}
        <ArrowRight className="h-4 w-4 ml-1" />
      </Button>

      {/* Switch mode */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Or try another mode
        </p>
        <div className="flex flex-wrap gap-1.5">
          {modes
            .filter((m) => m !== session.mode)
            .map((m) => (
              <Button
                key={m}
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => onChangeMode(m)}
              >
                {STUDY_MODE_LABEL[m]}
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}

function RunningStage({
  session,
  step,
  total,
  progress,
  item,
  revealed,
  onReveal,
  onAnswer,
  onNext,
}: {
  session: StudySession;
  step: number;
  total: number;
  progress: number;
  item: SessionItem;
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>
            {step + 1} of {total}
          </span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Card body per mode */}
      {session.mode === "flashcards" && item.kind === "flashcard" && (
        <button
          type="button"
          onClick={onReveal}
          className="w-full min-h-[180px] rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors p-6 text-left"
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            {revealed ? "Answer" : "Prompt · tap to flip"}
          </p>
          <p className="text-base text-foreground leading-relaxed">
            {revealed ? item.data.back : item.data.front}
          </p>
        </button>
      )}

      {session.mode === "quiz" && item.kind === "quiz" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            {item.data.prompt}
          </p>
          <div className="space-y-2">
            {item.data.choices.map((choice, i) => {
              const isAnswer = i === item.data.answerIndex;
              const showState = revealed;
              return (
                <button
                  key={choice + i}
                  type="button"
                  disabled={revealed}
                  onClick={() => onAnswer(isAnswer)}
                  className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
                    showState && isAnswer
                      ? "border-success/40 bg-success/10 text-foreground"
                      : "border-border/60 bg-muted/20 hover:bg-muted/40 text-foreground"
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
          {revealed && (
            <p className="text-xs text-muted-foreground">
              {item.data.rationale}
            </p>
          )}
        </div>
      )}

      {session.mode === "practice" && item.kind === "practice" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            {item.data.prompt}
          </p>
          <p className="text-xs text-muted-foreground">
            Hint: {item.data.hint}
          </p>
          {!revealed ? (
            <Button variant="outline" size="sm" onClick={onReveal}>
              Show solution sketch
            </Button>
          ) : (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
              {item.data.solutionSketch}
            </div>
          )}
        </div>
      )}

      {session.mode === "explain" && item.kind === "explain" && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {item.data.heading}
          </p>
          <p className="text-sm text-foreground leading-relaxed">
            {item.data.body}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {session.mode === "flashcards" && !revealed && (
          <Button variant="outline" className="flex-1" onClick={onReveal}>
            Reveal
          </Button>
        )}
        <Button
          className="flex-1 bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
          onClick={onNext}
          disabled={session.mode === "quiz" && !revealed}
        >
          {step + 1 >= total ? "Finish" : "Next"}{" "}
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function DoneStage({
  session,
  correct,
  answered,
  onRestart,
  onGoLab,
  onClose,
}: {
  session: StudySession;
  correct: number;
  answered: number;
  onRestart: () => void;
  onGoLab: () => void;
  onClose: () => void;
}) {
  const accuracy =
    answered > 0 ? Math.round((correct / answered) * 100) : undefined;

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-lg border border-success/30 bg-success/5 p-4">
        <div className="flex items-center gap-2 mb-1 text-success text-xs font-medium">
          <CheckCircle2 className="h-4 w-4" /> Session complete
        </div>
        <p className="text-sm text-foreground">
          Nice — {STUDY_MODE_LABEL[session.mode].toLowerCase()} on{" "}
          <span className="font-medium">{session.topic}</span> done.
          {accuracy !== undefined && (
            <> You got <span className="font-medium">{correct}/{answered}</span> ({accuracy}%).</>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-1 text-primary text-xs font-medium">
          <Brain className="h-3.5 w-3.5" /> Campus Brain updated
        </div>
        <p className="text-sm text-foreground">
          Momentum bumped for {session.topic}. Come back tomorrow for one more
          quick pass to lock this in.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          className="justify-between bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
          onClick={onGoLab}
        >
          Keep studying in Study Lab <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onRestart} className="justify-between">
          <span className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Run it again
          </span>
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Done for now
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Item picker                                                         */
/* ------------------------------------------------------------------ */

type SessionItem =
  | { kind: "flashcard"; data: StudySession["flashcards"][number] }
  | { kind: "quiz"; data: StudySession["quiz"][number] }
  | { kind: "practice"; data: StudySession["practice"][number] }
  | { kind: "explain"; data: StudySession["explain"][number] };

function pickItems(session: StudySession): SessionItem[] {
  switch (session.mode) {
    case "flashcards":
      return session.flashcards.map((d) => ({ kind: "flashcard", data: d }));
    case "quiz":
      return session.quiz.map((d) => ({ kind: "quiz", data: d }));
    case "practice":
      return session.practice.map((d) => ({ kind: "practice", data: d }));
    case "explain":
      return session.explain.map((d) => ({ kind: "explain", data: d }));
  }
}
