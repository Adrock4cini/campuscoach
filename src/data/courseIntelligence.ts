// Course Intelligence Data Model & Mock Data

export interface School {
  id: string;
  name: string;
}

export interface Professor {
  id: string;
  name: string;
  schoolId: string;
  department: string;
}

export interface Textbook {
  id: string;
  title: string;
  edition: string;
  author: string;
  isbn: string;
  chapters: { number: number; title: string }[];
}

export interface CourseIntelligence {
  classId: string;
  professorId: string;
  topicEmphasis: { topic: string; mentions: number }[];
  formatEmphasis: { format: string; mentions: number }[];
  studyMorePatterns: { topic: string; mentions: number }[];
  difficultyTrend: number; // 1-5
  adviceTrends: string[];
}

export type ExamFormat = 
  | "multiple-choice" | "true-false" | "short-answer" | "essay"
  | "word-problems" | "diagrams" | "definitions" | "application-based" | "memorization-heavy";

export interface ExamDebrief {
  id: string;
  classId: string;
  professorId: string;
  examId: string;
  examName: string;
  className: string;
  dateTaken: string;
  chaptersCoversed: string[];
  topicTags: string[];
  difficulty: number; // 1-5
  timePressure: number; // 1-5
  confidence: number; // 1-5
  formatTags: ExamFormat[];
  emphasizedTopics: string[];
  studyMoreTopics: string[];
  mostImportantChapters: string[];
  surprises: string;
  adviceForNext: string;
  createdAt: string;
}

// Mock data

export const schools: School[] = [
  { id: "su1", name: "State University" },
];

export const professors: Professor[] = [
  { id: "prof1", name: "Dr. Martinez", schoolId: "su1", department: "Psychology" },
  { id: "prof2", name: "Dr. Chen", schoolId: "su1", department: "Biology" },
  { id: "prof3", name: "Prof. Williams", schoolId: "su1", department: "English" },
  { id: "prof4", name: "Dr. Patel", schoolId: "su1", department: "Mathematics" },
];

export const textbooks: Textbook[] = [
  {
    id: "tb1", title: "Psychology: Themes and Variations", edition: "11th", author: "Wayne Weiten", isbn: "978-1337570909",
    chapters: [
      { number: 1, title: "Foundations of Psychology" },
      { number: 2, title: "Research Methods" },
      { number: 3, title: "Biological Bases of Behavior" },
      { number: 4, title: "Sensation & Perception" },
      { number: 5, title: "States of Consciousness" },
      { number: 6, title: "Memory & Learning" },
      { number: 7, title: "Cognition & Intelligence" },
    ],
  },
  {
    id: "tb2", title: "Campbell Biology", edition: "12th", author: "Lisa Urry", isbn: "978-0135188743",
    chapters: [
      { number: 1, title: "Cell Structure" },
      { number: 2, title: "Cell Membrane & Transport" },
      { number: 3, title: "Cellular Respiration" },
      { number: 4, title: "Photosynthesis" },
      { number: 5, title: "Cell Division" },
      { number: 6, title: "Genetics" },
    ],
  },
  {
    id: "tb3", title: "The Norton Field Guide to Writing", edition: "6th", author: "Richard Bullock", isbn: "978-0393655780",
    chapters: [
      { number: 1, title: "Rhetorical Analysis" },
      { number: 2, title: "Research Methods" },
      { number: 3, title: "Argumentative Writing" },
      { number: 4, title: "Synthesis Essays" },
    ],
  },
  {
    id: "tb4", title: "College Algebra", edition: "8th", author: "Robert Blitzer", isbn: "978-0134469164",
    chapters: [
      { number: 1, title: "Functions & Graphs" },
      { number: 2, title: "Linear Functions" },
      { number: 3, title: "Quadratic Functions" },
      { number: 4, title: "Polynomial Functions" },
      { number: 5, title: "Rational Functions" },
      { number: 6, title: "Exponential & Logarithmic" },
    ],
  },
];

// Map classes to textbooks and professors
export const classTextbookMap: Record<string, string> = {
  psych101: "tb1",
  bio200: "tb2",
  eng102: "tb3",
  math150: "tb4",
};

export const classProfessorMap: Record<string, string> = {
  psych101: "prof1",
  bio200: "prof2",
  eng102: "prof3",
  math150: "prof4",
};

// Mock debriefs from "other students"
export const examDebriefs: ExamDebrief[] = [
  {
    id: "deb1", classId: "psych101", professorId: "prof1", examId: "e2", examName: "Exam 2: Chapters 4-6",
    className: "Intro to Psychology", dateTaken: "2025-11-15",
    chaptersCoversed: ["Sensation & Perception", "States of Consciousness", "Memory & Learning"],
    topicTags: ["Memory", "Encoding", "Sleep stages", "Signal detection"],
    difficulty: 3, timePressure: 4, confidence: 3,
    formatTags: ["multiple-choice", "short-answer", "application-based"],
    emphasizedTopics: ["Memory models", "Encoding types", "Sleep cycles"],
    studyMoreTopics: ["Retrieval cues", "Interference theory"],
    mostImportantChapters: ["Memory & Learning", "Sensation & Perception"],
    surprises: "There were a lot of application scenarios — not just definitions.",
    adviceForNext: "Study the lecture examples, not just the textbook. Dr. Martinez loves real-world scenarios.",
    createdAt: "2025-11-15",
  },
  {
    id: "deb2", classId: "psych101", professorId: "prof1", examId: "e2", examName: "Exam 2: Chapters 4-6",
    className: "Intro to Psychology", dateTaken: "2025-11-15",
    chaptersCoversed: ["Sensation & Perception", "States of Consciousness", "Memory & Learning"],
    topicTags: ["Perception", "Memory", "Consciousness"],
    difficulty: 4, timePressure: 3, confidence: 2,
    formatTags: ["multiple-choice", "application-based", "definitions"],
    emphasizedTopics: ["Memory models", "Perception vs sensation", "REM sleep"],
    studyMoreTopics: ["Long-term memory types", "Context-dependent memory"],
    mostImportantChapters: ["Memory & Learning"],
    surprises: "A whole section on consciousness that I didn't expect to be so detailed.",
    adviceForNext: "Don't skip the consciousness chapter. It's shorter but shows up a lot.",
    createdAt: "2025-11-16",
  },
  {
    id: "deb3", classId: "math150", professorId: "prof4", examId: "e1", examName: "Midterm Exam 2",
    className: "College Algebra", dateTaken: "2025-10-20",
    chaptersCoversed: ["Quadratic Functions", "Polynomial Functions"],
    topicTags: ["Quadratic formula", "Graphing", "Polynomial division", "Zeros"],
    difficulty: 4, timePressure: 5, confidence: 2,
    formatTags: ["word-problems", "short-answer", "diagrams"],
    emphasizedTopics: ["Graphing polynomials", "Finding zeros", "Word problems"],
    studyMoreTopics: ["Polynomial long division", "Complex roots"],
    mostImportantChapters: ["Polynomial Functions"],
    surprises: "So many word problems. I expected more straightforward computation.",
    adviceForNext: "Practice the word problems from the homework. Dr. Patel reuses similar structures.",
    createdAt: "2025-10-20",
  },
  {
    id: "deb4", classId: "bio200", professorId: "prof2", examId: "e3", examName: "Unit 3 Exam",
    className: "Biology II", dateTaken: "2025-11-01",
    chaptersCoversed: ["Cellular Respiration", "Photosynthesis", "Cell Division"],
    topicTags: ["Mitosis", "Meiosis", "ATP", "Chloroplast"],
    difficulty: 3, timePressure: 3, confidence: 4,
    formatTags: ["multiple-choice", "diagrams", "short-answer"],
    emphasizedTopics: ["Mitosis vs Meiosis", "ATP production", "Photosynthesis steps"],
    studyMoreTopics: ["Meiosis II details", "Fermentation"],
    mostImportantChapters: ["Cell Division", "Cellular Respiration"],
    surprises: "There were diagram labeling questions I didn't expect.",
    adviceForNext: "Know the diagrams. Dr. Chen loves visual questions.",
    createdAt: "2025-11-01",
  },
];

// Aggregated intelligence per class
export function getCourseInsights(classId: string): CourseIntelligence | null {
  const debriefs = examDebriefs.filter(d => d.classId === classId);
  if (debriefs.length === 0) return null;

  const profId = classProfessorMap[classId] || "";

  // Aggregate topic emphasis
  const topicCounts: Record<string, number> = {};
  debriefs.forEach(d => {
    d.emphasizedTopics.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; });
  });
  const topicEmphasis = Object.entries(topicCounts)
    .map(([topic, mentions]) => ({ topic, mentions }))
    .sort((a, b) => b.mentions - a.mentions);

  // Aggregate format emphasis
  const formatCounts: Record<string, number> = {};
  debriefs.forEach(d => {
    d.formatTags.forEach(f => { formatCounts[f] = (formatCounts[f] || 0) + 1; });
  });
  const formatEmphasis = Object.entries(formatCounts)
    .map(([format, mentions]) => ({ format, mentions }))
    .sort((a, b) => b.mentions - a.mentions);

  // Study more patterns
  const studyCounts: Record<string, number> = {};
  debriefs.forEach(d => {
    d.studyMoreTopics.forEach(t => { studyCounts[t] = (studyCounts[t] || 0) + 1; });
  });
  const studyMorePatterns = Object.entries(studyCounts)
    .map(([topic, mentions]) => ({ topic, mentions }))
    .sort((a, b) => b.mentions - a.mentions);

  const avgDifficulty = debriefs.reduce((s, d) => s + d.difficulty, 0) / debriefs.length;

  const adviceTrends = [...new Set(debriefs.map(d => d.adviceForNext))];

  return {
    classId,
    professorId: profId,
    topicEmphasis,
    formatEmphasis,
    studyMorePatterns,
    difficultyTrend: Math.round(avgDifficulty * 10) / 10,
    adviceTrends,
  };
}

// Generate AI summary for a class
export function generateInsightSummary(classId: string): string[] {
  const insights = getCourseInsights(classId);
  if (!insights) return ["No peer insights available yet for this course."];

  const debriefs = examDebriefs.filter(d => d.classId === classId);
  const summaries: string[] = [];

  if (insights.topicEmphasis.length > 0) {
    const top = insights.topicEmphasis.slice(0, 3).map(t => t.topic).join(", ");
    summaries.push(`Students most often mentioned: ${top}`);
  }

  if (insights.formatEmphasis.length > 0) {
    const topFormat = insights.formatEmphasis[0].format.replace(/-/g, " ");
    summaries.push(`Exams appear to lean toward ${topFormat} format`);
  }

  if (insights.studyMorePatterns.length > 0) {
    const weak = insights.studyMorePatterns[0].topic;
    summaries.push(`Students consistently wished they had studied "${weak}" more`);
  }

  if (insights.difficultyTrend >= 4) {
    summaries.push("This exam is generally rated as difficult — plan extra study time");
  }

  const timePressure = debriefs.reduce((s, d) => s + d.timePressure, 0) / debriefs.length;
  if (timePressure >= 4) {
    summaries.push("Most students report significant time pressure");
  }

  return summaries;
}
