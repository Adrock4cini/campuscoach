import { useState, useCallback, useRef, useEffect } from "react";
import { StudyQuestion, StudySessionState, StudyMode } from "@/data/questions";

export interface SessionConfig {
  classId: string;
  topic: string;
  mode: StudyMode;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  questions: StudyQuestion[];
  durationLimit?: number; // seconds for timed challenge
}

export type SessionPhase = "setup" | "active" | "results";

export function useStudySession() {
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [session, setSession] = useState<StudySessionState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = useCallback((config: SessionConfig) => {
    const s: StudySessionState = {
      sessionId: `session-${Date.now()}`,
      classId: config.classId,
      topic: config.topic,
      mode: config.mode,
      difficulty: config.difficulty,
      questions: config.questions,
      totalQuestions: config.questions.length,
      currentIndex: 0,
      correctCount: 0,
      incorrectCount: 0,
      skippedCount: 0,
      answers: [],
      startTime: Date.now(),
      endTime: null,
      durationLimit: config.durationLimit ?? null,
    };
    setSession(s);
    setPhase("active");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }, []);

  const recordAnswer = useCallback((questionId: string, correct: boolean | null, userAnswer: string) => {
    setSession(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated.answers = [...updated.answers, { questionId, correct, userAnswer }];
      if (correct === true) updated.correctCount++;
      else if (correct === false) updated.incorrectCount++;
      else updated.skippedCount++;
      return updated;
    });
  }, []);

  const nextQuestion = useCallback(() => {
    setSession(prev => {
      if (!prev) return prev;
      const nextIdx = prev.currentIndex + 1;
      if (nextIdx >= prev.totalQuestions) {
        return prev; // will end
      }
      return { ...prev, currentIndex: nextIdx };
    });
  }, []);

  const endSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSession(prev => prev ? { ...prev, endTime: Date.now() } : prev);
    setPhase("results");
  }, []);

  const resetSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSession(null);
    setPhase("setup");
    setElapsed(0);
  }, []);

  // Auto-end timed challenge
  useEffect(() => {
    if (session?.durationLimit && elapsed >= session.durationLimit && phase === "active") {
      endSession();
    }
  }, [elapsed, session?.durationLimit, phase, endSession]);

  // Cleanup
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const currentQuestion = session?.questions[session.currentIndex] ?? null;
  const isLastQuestion = session ? session.currentIndex >= session.totalQuestions - 1 : false;
  const scorePercent = session && session.answers.length > 0
    ? Math.round((session.correctCount / session.answers.length) * 100)
    : 0;

  return {
    phase,
    session,
    elapsed,
    currentQuestion,
    isLastQuestion,
    scorePercent,
    startSession,
    recordAnswer,
    nextQuestion,
    endSession,
    resetSession,
    setPhase,
  };
}
