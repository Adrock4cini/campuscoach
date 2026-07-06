/**
 * Study From Capture — turn a captured note/scan/recording into a
 * short, focused study session.
 *
 * Today this is deterministic mock generation over the fields that
 * already live on a capture (summary, key concepts, kind, topic).
 * When real AI generation is wired in, only the internals change —
 * the public shape stays the same so the UI does not move.
 */

import type { CaptureKind } from "@/lib/capture/types";
import type { MemoryItem } from "@/components/capture/CaptureDetailDrawer";

export type StudyMode = "flashcards" | "quiz" | "practice" | "explain";

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  rationale: string;
}

export interface PracticeProblem {
  id: string;
  prompt: string;
  hint: string;
  solutionSketch: string;
}

export interface ExplainBlock {
  id: string;
  heading: string;
  body: string;
}

export interface StudySession {
  mode: StudyMode;
  modeLabel: string;
  reason: string; // Why Campus Brain picked this mode.
  topic: string;
  classId: string;
  estimatedMinutes: number;
  summary: string;
  keyConcepts: string[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  practice: PracticeProblem[];
  explain: ExplainBlock[];
}

/* ------------------------------------------------------------------ */
/* Mode recommendation                                                 */
/* ------------------------------------------------------------------ */

const MODE_LABEL: Record<StudyMode, string> = {
  flashcards: "Flashcards",
  quiz: "Quick quiz",
  practice: "Practice questions",
  explain: "Explain it simply",
};

/**
 * Campus Brain picks ONE study mode per capture. Rules of thumb:
 *   - Professor hints & quick notes → flashcards (fast recall)
 *   - Lecture recordings → quick quiz (verify what stuck)
 *   - Textbook / uploaded file → practice questions (application)
 *   - Board scan → explain it simply (concept-first)
 *   - Ask Brain → explain it simply
 * Falls back based on the number of concepts extracted.
 */
export function recommendStudyModeForCapture(item: MemoryItem): {
  mode: StudyMode;
  reason: string;
} {
  const conceptCount = item.keyConcepts.length;

  switch (item.kind) {
    case "professor-hint":
      return {
        mode: "flashcards",
        reason:
          "Professor hints predict exam questions best — lock them in with fast recall.",
      };
    case "quick-note":
      return {
        mode: "flashcards",
        reason:
          "Quick notes fade fastest. A 2-minute flashcard pass locks them in.",
      };
    case "record-lecture":
      return {
        mode: "quiz",
        reason:
          "You already heard it — a short quiz confirms what actually stuck.",
      };
    case "scan-textbook":
      return {
        mode: "practice",
        reason:
          "Textbook concepts stick better when you apply them, not re-read them.",
      };
    case "upload-file":
      return {
        mode: conceptCount >= 3 ? "practice" : "flashcards",
        reason:
          conceptCount >= 3
            ? "Enough material here to practice with — try one worked problem."
            : "Small file — a quick recall pass will do.",
      };
    case "scan-board":
      return {
        mode: "explain",
        reason:
          "Board scans capture the shape of an idea. Explain it back to yourself first.",
      };
    case "ask-brain":
    default:
      return {
        mode: "explain",
        reason: "Best mastered by explaining it in your own words.",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Generators (mock)                                                   */
/* ------------------------------------------------------------------ */

function id(prefix: string, i: number) {
  return `${prefix}_${i}_${Math.random().toString(36).slice(2, 7)}`;
}

function sentence(item: MemoryItem, fallback: string): string {
  const s = (item.summary || "").trim();
  if (!s) return fallback;
  return s.length > 180 ? s.slice(0, 177) + "…" : s;
}

export function generateFlashcardsFromCapture(item: MemoryItem): Flashcard[] {
  const concepts = item.keyConcepts.length
    ? item.keyConcepts
    : [item.topic];
  return concepts.slice(0, 6).map((c, i) => ({
    id: id("fc", i),
    front: `What is "${c}"?`,
    back:
      i === 0
        ? sentence(item, `A key idea in ${item.topic}.`)
        : `Core concept from ${item.topic}. Recall the definition and one example from your capture.`,
  }));
}

export function generateQuizFromCapture(item: MemoryItem): QuizQuestion[] {
  const concepts = item.keyConcepts.length
    ? item.keyConcepts
    : [item.topic];
  return concepts.slice(0, 4).map((c, i) => {
    const others = concepts.filter((x) => x !== c).slice(0, 3);
    const distractors =
      others.length >= 3
        ? others
        : [...others, "None of the above", "All of the above"].slice(0, 3);
    const choices = [c, ...distractors];
    // Shuffle deterministically per index so it's not always first.
    const rotate = i % choices.length;
    const rotated = [...choices.slice(rotate), ...choices.slice(0, rotate)];
    return {
      id: id("q", i),
      prompt: `Which of these best matches the idea covered around "${c}"?`,
      choices: rotated,
      answerIndex: rotated.indexOf(c),
      rationale: `From your capture: ${sentence(item, `${c} is central to ${item.topic}.`)}`,
    };
  });
}

export function generatePracticeFromCapture(item: MemoryItem): PracticeProblem[] {
  const concepts = item.keyConcepts.length
    ? item.keyConcepts
    : [item.topic];
  return concepts.slice(0, 3).map((c, i) => ({
    id: id("pr", i),
    prompt: `Apply "${c}" to a short scenario related to ${item.topic}.`,
    hint: `Start from the definition of ${c}, then walk through one example.`,
    solutionSketch: sentence(
      item,
      `Sketch: identify ${c}, connect it to ${item.topic}, and finish with one takeaway.`,
    ),
  }));
}

export function generateExplainFromCapture(item: MemoryItem): ExplainBlock[] {
  const concepts = item.keyConcepts.length
    ? item.keyConcepts
    : [item.topic];
  const blocks: ExplainBlock[] = [
    {
      id: id("ex", 0),
      heading: "The one-sentence idea",
      body: sentence(item, `${item.topic} in one line.`),
    },
  ];
  concepts.slice(0, 3).forEach((c, i) => {
    blocks.push({
      id: id("ex", i + 1),
      heading: c,
      body: `Say it out loud: what is ${c}, and how does it show up in ${item.topic}? Aim for one sentence, one example.`,
    });
  });
  blocks.push({
    id: id("ex", 99),
    heading: "Check yourself",
    body: "If you can teach this to a friend in 60 seconds, you know it. If you stumble, run one flashcard pass.",
  });
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Session builder                                                     */
/* ------------------------------------------------------------------ */

function estimate(mode: StudyMode, item: MemoryItem): number {
  const n = Math.max(item.keyConcepts.length, 1);
  switch (mode) {
    case "flashcards":
      return Math.min(10, 2 + n);
    case "quiz":
      return Math.min(12, 3 + n);
    case "practice":
      return Math.min(20, 6 + n * 3);
    case "explain":
      return Math.min(10, 4 + n);
  }
}

export function buildStudySessionFromCapture(
  item: MemoryItem,
  classId: string,
  overrideMode?: StudyMode,
): StudySession {
  const rec = recommendStudyModeForCapture(item);
  const mode = overrideMode ?? rec.mode;
  return {
    mode,
    modeLabel: MODE_LABEL[mode],
    reason: rec.reason,
    topic: item.topic,
    classId,
    estimatedMinutes: estimate(mode, item),
    summary: item.summary,
    keyConcepts: item.keyConcepts,
    flashcards: generateFlashcardsFromCapture(item),
    quiz: generateQuizFromCapture(item),
    practice: generatePracticeFromCapture(item),
    explain: generateExplainFromCapture(item),
  };
}

export const STUDY_MODE_LABEL = MODE_LABEL;
