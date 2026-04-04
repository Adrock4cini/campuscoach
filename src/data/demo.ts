export interface ClassInfo {
  id: string;
  name: string;
  professor: string;
  location: string;
  days: string[];
  time: string;
  color: string;
  currentTopic: string;
  nextExamDate: string;
  readiness: number;
  suggestedAction: string;
  gradingWeights: { category: string; weight: number }[];
  chapters: { number: number; title: string; status: 'completed' | 'in-progress' | 'not-started' }[];
}

export interface Assignment {
  id: string;
  classId: string;
  className: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  estimatedTime: string;
  status: 'not-started' | 'started' | 'draft-done' | 'turned-in' | 'needs-clarification';
  instructions: string;
}

export interface Exam {
  id: string;
  classId: string;
  className: string;
  title: string;
  date: string;
  readiness: number;
  topics: string[];
  strongAreas: string[];
  weakAreas: string[];
}

export interface WorkShift {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  location: string;
}

export interface StudySession {
  id: string;
  classId: string;
  date: string;
  duration: number;
  type: string;
  score?: number;
}

export const studentName = "Aspen";

export const classes: ClassInfo[] = [
  {
    id: "psych101",
    name: "Intro to Psychology",
    professor: "Dr. Martinez",
    location: "Harmon Hall 204",
    days: ["Mon", "Wed", "Fri"],
    time: "10:00 AM",
    color: "bg-primary",
    currentTopic: "Memory & Learning",
    nextExamDate: "2026-04-11",
    readiness: 62,
    suggestedAction: "Review lecture 7 flashcards",
    gradingWeights: [
      { category: "Exams", weight: 40 },
      { category: "Quizzes", weight: 20 },
      { category: "Papers", weight: 25 },
      { category: "Participation", weight: 15 },
    ],
    chapters: [
      { number: 1, title: "Foundations of Psychology", status: "completed" },
      { number: 2, title: "Research Methods", status: "completed" },
      { number: 3, title: "Biological Bases of Behavior", status: "completed" },
      { number: 4, title: "Sensation & Perception", status: "completed" },
      { number: 5, title: "States of Consciousness", status: "in-progress" },
      { number: 6, title: "Memory & Learning", status: "not-started" },
      { number: 7, title: "Cognition & Intelligence", status: "not-started" },
    ],
  },
  {
    id: "bio200",
    name: "Biology II",
    professor: "Dr. Chen",
    location: "Science Center 112",
    days: ["Tue", "Thu"],
    time: "9:00 AM",
    color: "bg-success",
    currentTopic: "Cell Division & Genetics",
    nextExamDate: "2026-04-18",
    readiness: 78,
    suggestedAction: "Complete practice problems on mitosis",
    gradingWeights: [
      { category: "Exams", weight: 50 },
      { category: "Labs", weight: 30 },
      { category: "Homework", weight: 20 },
    ],
    chapters: [
      { number: 1, title: "Cell Structure", status: "completed" },
      { number: 2, title: "Cell Membrane & Transport", status: "completed" },
      { number: 3, title: "Cellular Respiration", status: "completed" },
      { number: 4, title: "Photosynthesis", status: "completed" },
      { number: 5, title: "Cell Division", status: "in-progress" },
      { number: 6, title: "Genetics", status: "not-started" },
    ],
  },
  {
    id: "eng102",
    name: "English Composition II",
    professor: "Prof. Williams",
    location: "Liberal Arts 308",
    days: ["Mon", "Wed"],
    time: "1:00 PM",
    color: "bg-accent",
    currentTopic: "Argumentative Essays",
    nextExamDate: "",
    readiness: 45,
    suggestedAction: "Start brainstorming for Essay 3",
    gradingWeights: [
      { category: "Essays", weight: 60 },
      { category: "Discussion Posts", weight: 20 },
      { category: "Peer Reviews", weight: 10 },
      { category: "Participation", weight: 10 },
    ],
    chapters: [
      { number: 1, title: "Rhetorical Analysis", status: "completed" },
      { number: 2, title: "Research Methods", status: "completed" },
      { number: 3, title: "Argumentative Writing", status: "in-progress" },
      { number: 4, title: "Synthesis Essays", status: "not-started" },
    ],
  },
  {
    id: "math150",
    name: "College Algebra",
    professor: "Dr. Patel",
    location: "Math Building 101",
    days: ["Mon", "Wed", "Fri"],
    time: "8:00 AM",
    color: "bg-warning",
    currentTopic: "Polynomial Functions",
    nextExamDate: "2026-04-09",
    readiness: 34,
    suggestedAction: "Catch up on Chapter 4 homework",
    gradingWeights: [
      { category: "Exams", weight: 45 },
      { category: "Homework", weight: 30 },
      { category: "Quizzes", weight: 15 },
      { category: "Final", weight: 10 },
    ],
    chapters: [
      { number: 1, title: "Functions & Graphs", status: "completed" },
      { number: 2, title: "Linear Functions", status: "completed" },
      { number: 3, title: "Quadratic Functions", status: "completed" },
      { number: 4, title: "Polynomial Functions", status: "in-progress" },
      { number: 5, title: "Rational Functions", status: "not-started" },
      { number: 6, title: "Exponential & Logarithmic", status: "not-started" },
    ],
  },
];

export const assignments: Assignment[] = [
  {
    id: "a1",
    classId: "eng102",
    className: "English Composition II",
    title: "Argumentative Essay Draft",
    dueDate: "2026-04-07",
    priority: "high",
    estimatedTime: "3 hours",
    status: "started",
    instructions: "Write a 5-page argumentative essay on a social issue of your choice. Use at least 4 scholarly sources. MLA format.",
  },
  {
    id: "a2",
    classId: "math150",
    className: "College Algebra",
    title: "Chapter 4 Problem Set",
    dueDate: "2026-04-06",
    priority: "high",
    estimatedTime: "1.5 hours",
    status: "not-started",
    instructions: "Complete problems 1-30 (odd) from Section 4.2 and 4.3.",
  },
  {
    id: "a3",
    classId: "psych101",
    className: "Intro to Psychology",
    title: "Reading Response: Chapter 5",
    dueDate: "2026-04-08",
    priority: "medium",
    estimatedTime: "45 minutes",
    status: "not-started",
    instructions: "Write a 1-page response discussing key concepts from Chapter 5. Include personal connections.",
  },
  {
    id: "a4",
    classId: "bio200",
    className: "Biology II",
    title: "Lab Report: Osmosis",
    dueDate: "2026-04-10",
    priority: "medium",
    estimatedTime: "2 hours",
    status: "draft-done",
    instructions: "Complete formal lab report for osmosis experiment. Include data tables and analysis.",
  },
  {
    id: "a5",
    classId: "eng102",
    className: "English Composition II",
    title: "Discussion Post Week 8",
    dueDate: "2026-04-05",
    priority: "low",
    estimatedTime: "20 minutes",
    status: "not-started",
    instructions: "Post a 200-word response to the weekly reading. Reply to at least 2 classmates.",
  },
];

export const exams: Exam[] = [
  {
    id: "e1",
    classId: "math150",
    className: "College Algebra",
    title: "Midterm Exam 2",
    date: "2026-04-09",
    readiness: 34,
    topics: ["Quadratic Functions", "Polynomial Functions", "Graphing", "Word Problems"],
    strongAreas: ["Quadratic formula", "Basic graphing"],
    weakAreas: ["Polynomial long division", "Complex roots", "Word problems"],
  },
  {
    id: "e2",
    classId: "psych101",
    className: "Intro to Psychology",
    title: "Exam 2: Chapters 4-6",
    date: "2026-04-11",
    readiness: 62,
    topics: ["Sensation & Perception", "Consciousness", "Memory & Learning"],
    strongAreas: ["Sensation basics", "Sleep stages"],
    weakAreas: ["Memory models", "Learning theories"],
  },
  {
    id: "e3",
    classId: "bio200",
    className: "Biology II",
    title: "Unit 3 Exam",
    date: "2026-04-18",
    readiness: 78,
    topics: ["Cellular Respiration", "Photosynthesis", "Cell Division"],
    strongAreas: ["Cellular respiration steps", "Photosynthesis overview"],
    weakAreas: ["Mitosis vs Meiosis details"],
  },
];

export const workShifts: WorkShift[] = [
  { id: "w1", day: "Mon", startTime: "5:00 PM", endTime: "9:00 PM", location: "Campus Bookstore" },
  { id: "w2", day: "Wed", startTime: "5:00 PM", endTime: "9:00 PM", location: "Campus Bookstore" },
  { id: "w3", day: "Fri", startTime: "12:00 PM", endTime: "5:00 PM", location: "Campus Bookstore" },
  { id: "w4", day: "Sat", startTime: "10:00 AM", endTime: "4:00 PM", location: "Campus Bookstore" },
];

export const studySessions: StudySession[] = [
  { id: "s1", classId: "psych101", date: "2026-04-01", duration: 25, type: "Flashcards", score: 72 },
  { id: "s2", classId: "bio200", date: "2026-04-01", duration: 45, type: "Practice Quiz", score: 85 },
  { id: "s3", classId: "psych101", date: "2026-04-02", duration: 20, type: "Notes Review" },
  { id: "s4", classId: "math150", date: "2026-04-02", duration: 30, type: "Practice Problems", score: 55 },
  { id: "s5", classId: "bio200", date: "2026-04-03", duration: 25, type: "Flashcards", score: 90 },
  { id: "s6", classId: "psych101", date: "2026-04-03", duration: 15, type: "Quick Review" },
];

export const studyStreak = 4;

export function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date("2026-04-04");
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getReadinessColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

export function getReadinessBg(score: number): string {
  if (score >= 70) return "bg-success/10";
  if (score >= 50) return "bg-warning/10";
  return "bg-danger/10";
}

export function getReadinessLabel(score: number): string {
  if (score >= 80) return "Looking great!";
  if (score >= 65) return "Getting there";
  if (score >= 45) return "Needs attention";
  return "Let's catch up";
}

export function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return "bg-danger/10 text-danger";
  if (priority === 'medium') return "bg-warning/10 text-warning";
  return "bg-primary/10 text-primary";
}

export function getStatusLabel(status: Assignment['status']): string {
  const labels: Record<string, string> = {
    'not-started': 'Not Started',
    'started': 'In Progress',
    'draft-done': 'Draft Done',
    'turned-in': 'Turned In',
    'needs-clarification': 'Needs Help',
  };
  return labels[status] || status;
}
