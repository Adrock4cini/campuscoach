import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  StudyMode, getQuestionsForSession, getMatchingForSession,
  getModeType, modeLabels, StudyQuestion,
} from "@/data/questions";
import { useStudySession, SessionConfig } from "@/hooks/useStudySession";
import StudyModeSetup from "@/components/study/StudyModeSetup";
import SessionHeader from "@/components/study/SessionHeader";
import ResultsSummary from "@/components/study/ResultsSummary";
import FlashcardView from "@/components/study/FlashcardView";
import MultipleChoiceView from "@/components/study/MultipleChoiceView";
import FillBlankView from "@/components/study/FillBlankView";
import TrueFalseView from "@/components/study/TrueFalseView";
import MatchingView from "@/components/study/MatchingView";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function StudySession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get("mode") as StudyMode) || "flashcards";
  const initialClassId = searchParams.get("classId") || undefined;
  const initialTopic = searchParams.get("topic") || undefined;

  const [mode, setMode] = useState<StudyMode>(initialMode);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [streak, setStreak] = useState(0);
  const [missedQuestions, setMissedQuestions] = useState<StudyQuestion[]>([]);

  const engine = useStudySession();
  const { phase, session, elapsed, currentQuestion, isLastQuestion, scorePercent } = engine;

  const handleSetupStart = (config: { classId: string; topic: string; difficulty: "easy" | "medium" | "hard" | "mixed"; count: number; duration?: number }) => {
    let questions: StudyQuestion[];

    if (mode === "matching") {
      const mq = getMatchingForSession(config.classId, config.topic);
      questions = mq ? [mq] : [];
    } else {
      const type = getModeType(mode);
      questions = getQuestionsForSession(config.classId, config.topic, type, config.difficulty, config.count);
    }

    if (questions.length === 0) {
      // Fallback: get mixed questions
      questions = getQuestionsForSession(config.classId, "all", getModeType(mode), "mixed", config.count);
    }

    const sessionConfig: SessionConfig = {
      classId: config.classId,
      topic: config.topic,
      mode,
      difficulty: config.difficulty,
      questions,
      durationLimit: config.duration,
    };

    setStreak(0);
    setMissedQuestions([]);
    engine.startSession(sessionConfig);
  };

  const handleAnswer = (correct: boolean | null) => {
    if (!currentQuestion) return;
    engine.recordAnswer(currentQuestion.id, correct, "");
    if (correct) setStreak(s => s + 1);
    else setStreak(0);

    if (correct === false && currentQuestion) {
      setMissedQuestions(prev => [...prev, currentQuestion]);
    }

    // For flashcards, auto-advance
    if (mode === "flashcards" || mode === "true-false") {
      if (isLastQuestion) {
        setTimeout(() => engine.endSession(), 300);
      } else {
        setTimeout(() => engine.nextQuestion(), 300);
      }
    }
  };

  const handleNext = () => {
    if (isLastQuestion) {
      engine.endSession();
    } else {
      engine.nextQuestion();
    }
  };

  const handleMatchComplete = (correct: number, total: number) => {
    for (let i = 0; i < correct; i++) engine.recordAnswer(`match-${i}`, true, "");
    for (let i = correct; i < total; i++) engine.recordAnswer(`match-miss-${i}`, false, "");
    engine.endSession();
  };

  const handleExitAttempt = () => {
    if (phase === "active") setShowExitConfirm(true);
    else navigate("/study-lab");
  };

  const handleRetryMissed = () => {
    if (!session || missedQuestions.length === 0) return;
    engine.resetSession();
    setStreak(0);
    const retryConfig: SessionConfig = {
      classId: session.classId,
      topic: session.topic,
      mode: session.mode,
      difficulty: session.difficulty,
      questions: missedQuestions,
    };
    setMissedQuestions([]);
    engine.startSession(retryConfig);
  };

  const handleReplay = () => {
    if (!session) return;
    const questions = [...session.questions].sort(() => Math.random() - 0.5);
    engine.resetSession();
    setStreak(0);
    setMissedQuestions([]);
    engine.startSession({
      classId: session.classId,
      topic: session.topic,
      mode: session.mode,
      difficulty: session.difficulty,
      questions,
      durationLimit: session.durationLimit ?? undefined,
    });
  };

  const handleSwitchMode = () => {
    engine.resetSession();
    setStreak(0);
    setMissedQuestions([]);
  };

  // Setup phase
  if (phase === "setup") {
    return (
      <div className="max-w-5xl mx-auto">
        <StudyModeSetup
          mode={mode}
          onStart={handleSetupStart}
          onBack={() => navigate("/study-lab")}
          defaultClassId={initialClassId}
          defaultTopic={initialTopic}
        />
      </div>
    );
  }

  // Results phase
  if (phase === "results" && session) {
    return (
      <div className="max-w-5xl mx-auto py-4">
        <ResultsSummary
          classId={session.classId}
          topic={session.topic}
          mode={session.mode}
          correct={session.correctCount}
          incorrect={session.incorrectCount}
          skipped={session.skippedCount}
          elapsed={elapsed}
          onRetryMissed={handleRetryMissed}
          onReplay={handleReplay}
          onSwitchMode={handleSwitchMode}
          onBackToLab={() => navigate("/study-lab")}
        />
      </div>
    );
  }

  // Active phase
  if (!session || !currentQuestion) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <SessionHeader
        classId={session.classId}
        topic={session.topic}
        mode={session.mode}
        current={session.currentIndex}
        total={session.totalQuestions}
        elapsed={elapsed}
        durationLimit={session.durationLimit}
        onExit={handleExitAttempt}
      />

      {mode === "flashcards" && (
        <FlashcardView question={currentQuestion} onAnswer={handleAnswer} />
      )}
      {mode === "multiple-choice" && (
        <MultipleChoiceView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} />
      )}
      {mode === "fill-blank" && (
        <FillBlankView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} />
      )}
      {mode === "true-false" && (
        <TrueFalseView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} streak={streak} />
      )}
      {mode === "matching" && (
        <MatchingView question={currentQuestion} onComplete={handleMatchComplete} />
      )}
      {mode === "timed-challenge" && (
        currentQuestion.type === "true-false" ? (
          <TrueFalseView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} streak={streak} />
        ) : currentQuestion.type === "multiple-choice" ? (
          <MultipleChoiceView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} />
        ) : currentQuestion.type === "fill-blank" ? (
          <FillBlankView question={currentQuestion} onAnswer={handleAnswer} onNext={handleNext} isLast={isLastQuestion} />
        ) : (
          <FlashcardView question={currentQuestion} onAnswer={handleAnswer} />
        )
      )}

      {/* Exit confirmation */}
      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Leave study session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Your progress won't be saved. Are you sure?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>Keep studying</Button>
            <Button variant="destructive" onClick={() => { engine.resetSession(); navigate("/study-lab"); }}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
