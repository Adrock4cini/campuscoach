import type {
  AggregatedDebrief,
  AggregatedTopic,
} from "@/hooks/useClassIntelligence";

export interface DemoClassIntelligenceSample {
  topics: AggregatedTopic[];
  debriefs: AggregatedDebrief[];
  signalCount: number;
  signalUsers: number;
  weeklyContributions: number;
}

const EMPTY_SAMPLE: DemoClassIntelligenceSample = {
  topics: [],
  debriefs: [],
  signalCount: 0,
  signalUsers: 0,
  weeklyContributions: 0,
};

function topic(
  id: string,
  name: string,
  probability: number,
  students: number,
  missRate: number,
  examMentions: number,
  averageConfidence: number,
): AggregatedTopic {
  return {
    topic_id: id,
    topic_name: name,
    score: probability,
    probability,
    confidence_band: students >= 18 ? "High" : students >= 12 ? "Medium" : "Low",
    student_count: students,
    star_count: Math.max(4, Math.round(students * 0.55)),
    total_time_spent_minutes: students * 18,
    miss_rate: missRate,
    post_exam_mentions: examMentions,
    average_confidence: averageConfidence,
  };
}

function debrief(
  id: string,
  classId: string,
  examName: string,
  topics: string[],
  formats: string[],
  studyMore: string[],
  ratings: { difficulty: number; timePressure: number; confidence: number },
  advice: string,
): AggregatedDebrief {
  return {
    id,
    class_id: classId,
    exam_name: examName,
    date_taken: "2026-04-04",
    topics_mentioned: topics,
    format_tags: formats,
    study_more_tags: studyMore,
    difficulty: ratings.difficulty,
    time_pressure: ratings.timePressure,
    confidence: ratings.confidence,
    advice_notes: advice,
    created_at: "2026-04-04T18:00:00.000Z",
  };
}

const SAMPLES: Record<string, DemoClassIntelligenceSample> = {
  psych101: {
    topics: [
      topic("memory-models", "Memory models", 88, 24, 43, 7, 2.6),
      topic("encoding-types", "Encoding types", 79, 21, 31, 5, 3.1),
      topic("sleep-cycles", "Sleep cycles", 67, 18, 28, 4, 3.4),
      topic("retrieval-cues", "Retrieval cues", 61, 15, 46, 3, 2.4),
    ],
    debriefs: [
      debrief(
        "demo-psych-1",
        "psych101",
        "Exam 2: Chapters 4–6",
        ["Memory models", "Encoding types", "Sleep cycles"],
        ["multiple-choice", "application-based", "short-answer"],
        ["Retrieval cues", "Interference theory"],
        { difficulty: 4, timePressure: 4, confidence: 3 },
        "Practice the lecture examples, not only the definitions.",
      ),
      debrief(
        "demo-psych-2",
        "psych101",
        "Exam 2: Chapters 4–6",
        ["Memory models", "Sensation vs. perception"],
        ["multiple-choice", "definitions"],
        ["Context-dependent memory"],
        { difficulty: 3, timePressure: 3, confidence: 3 },
        "Explain each memory model out loud before taking the practice quiz.",
      ),
    ],
    signalCount: 42,
    signalUsers: 22,
    weeklyContributions: 8,
  },
  bio200: {
    topics: [
      topic("mitosis-vs-meiosis", "Mitosis vs. meiosis", 91, 20, 44, 6, 2.5),
      topic("cellular-respiration", "Cellular respiration", 76, 18, 29, 4, 3.2),
      topic("photosynthesis-steps", "Photosynthesis steps", 69, 16, 37, 3, 2.9),
    ],
    debriefs: [
      debrief(
        "demo-bio-1",
        "bio200",
        "Unit 3 Exam",
        ["Mitosis vs. meiosis", "ATP production", "Photosynthesis steps"],
        ["multiple-choice", "diagrams", "short-answer"],
        ["Meiosis II details", "Fermentation"],
        { difficulty: 3, timePressure: 3, confidence: 4 },
        "Redraw the cell-division diagrams from memory; several questions were visual.",
      ),
    ],
    signalCount: 31,
    signalUsers: 16,
    weeklyContributions: 6,
  },
  eng102: {
    topics: [
      topic("thesis-statements", "Thesis statements", 84, 16, 34, 4, 3.0),
      topic("counterarguments", "Counterarguments", 72, 14, 41, 3, 2.7),
      topic("source-integration", "Source integration", 64, 13, 38, 2, 2.9),
    ],
    debriefs: [
      debrief(
        "demo-eng-1",
        "eng102",
        "Argument Workshop",
        ["Thesis statements", "Counterarguments", "Source integration"],
        ["essay", "application-based"],
        ["MLA citations", "Topic sentences"],
        { difficulty: 3, timePressure: 2, confidence: 3 },
        "Bring one clear claim and test every paragraph against it.",
      ),
    ],
    signalCount: 22,
    signalUsers: 12,
    weeklyContributions: 4,
  },
  math150: {
    topics: [
      topic("graphing-polynomials", "Graphing polynomials", 93, 23, 49, 8, 2.3),
      topic("finding-zeros", "Finding zeros", 86, 21, 45, 6, 2.5),
      topic("polynomial-division", "Polynomial division", 77, 19, 52, 5, 2.1),
      topic("end-behavior", "End behavior", 66, 17, 32, 3, 3.0),
    ],
    debriefs: [
      debrief(
        "demo-math-1",
        "math150",
        "Midterm Exam 2",
        ["Graphing polynomials", "Finding zeros", "Word problems"],
        ["word-problems", "short-answer", "diagrams"],
        ["Polynomial division", "Complex roots"],
        { difficulty: 4, timePressure: 5, confidence: 2 },
        "Practice mixed problems so you have to choose the method yourself.",
      ),
      debrief(
        "demo-math-2",
        "math150",
        "Midterm Exam 2",
        ["Finding zeros", "End behavior"],
        ["word-problems", "short-answer"],
        ["Synthetic division"],
        { difficulty: 4, timePressure: 4, confidence: 3 },
        "Time yourself on the word problems and check each zero in the original function.",
      ),
    ],
    signalCount: 39,
    signalUsers: 19,
    weeklyContributions: 9,
  },
};

function cloneDebrief(row: AggregatedDebrief): AggregatedDebrief {
  return {
    ...row,
    topics_mentioned: [...row.topics_mentioned],
    format_tags: [...row.format_tags],
    study_more_tags: [...row.study_more_tags],
  };
}

/**
 * Returns deterministic, presentation-only intelligence for a demo class.
 * Every call returns fresh arrays so a local demo submission cannot mutate the
 * fixture seen by another page or test.
 */
export function getDemoClassIntelligence(
  classId: string | null | undefined,
): DemoClassIntelligenceSample {
  const sample = classId ? SAMPLES[classId] : undefined;
  const source = sample ?? EMPTY_SAMPLE;
  return {
    ...source,
    topics: source.topics.map((row) => ({ ...row })),
    debriefs: source.debriefs.map(cloneDebrief),
  };
}
