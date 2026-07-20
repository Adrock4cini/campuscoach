export interface ClassInfo {
  /** Supabase row id for real classes; demo classes only use `id`. */
  uuid?: string;
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
  chapters: Chapter[];
}

export interface Chapter {
  number: number;
  title: string;
  status: 'completed' | 'in-progress' | 'not-started';
  notes?: string;
  professorHints?: ProfessorHint[];
  uploadedImages?: string[];
  extractedText?: string;
  aiBreakdown?: {
    bigIdea?: string;
    keyTerms?: string[];
    professorCares?: string;
    confusing?: string;
    practiceNext?: string;
  };
}

export interface ProfessorHint {
  id: string;
  text: string;
  tag: 'exam-hint' | 'assignment-note' | 'class-reminder' | 'general';
  pinned?: boolean;
  createdAt: string;
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
  professorHints?: ProfessorHint[];
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
  professorHints?: ProfessorHint[];
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

export interface Lecture {
  id: string;
  classId: string;
  className: string;
  title: string;
  date: string;
  type: 'recording' | 'photo' | 'manual' | 'pdf';
  hasTranscript: boolean;
  hasAINotes: boolean;
  keyTopics: string[];
  transcript?: string;
  keyPoints?: string[];
  concepts?: string[];
  professorHints?: ProfessorHint[];
}

export type CalendarEventType = 'class' | 'work' | 'exam' | 'assignment' | 'study' | 'personal' | 'academic-deadline' | 'payment' | 'tutoring' | 'office-hours';

export interface CalendarEvent {
  id: string;
  day: string;
  startHour: number;
  duration: number;
  label: string;
  type: CalendarEventType;
  linkedId?: string;
  linkedRoute?: string;
  date?: string; // ISO date for proper week tracking
  description?: string;
  editable?: boolean;
}

export interface AcademicDate {
  id: string;
  label: string;
  date: string;
  type: 'semester-start' | 'semester-end' | 'tuition' | 'registration' | 'drop-deadline' | 'withdrawal' | 'holiday' | 'advising' | 'tutoring' | 'office-hours' | 'custom';
  description?: string;
}

export interface StudentProfile {
  name: string;
  school: string;
  major: string;
  year: string;
  semesterStart: string;
  semesterEnd: string;
  defaultStudyLength: number;
  reminderStyle: 'gentle' | 'standard' | 'high';
  encouragementTone: 'warm' | 'direct' | 'playful';
  focusSprintDefault: number;
}

export const studentProfile: StudentProfile = {
  name: "Aspen",
  school: "State University",
  major: "Psychology",
  year: "Sophomore",
  semesterStart: "2026-01-12",
  semesterEnd: "2026-05-08",
  defaultStudyLength: 25,
  reminderStyle: "gentle",
  encouragementTone: "warm",
  focusSprintDefault: 25,
};

export const studentName = "Aspen";

export const academicDates: AcademicDate[] = [
  { id: "ad1", label: "Semester Start", date: "2026-01-12", type: "semester-start" },
  { id: "ad2", label: "Last Day to Add/Drop", date: "2026-01-26", type: "drop-deadline", description: "Last day to add or drop classes without a W" },
  { id: "ad3", label: "Spring Break", date: "2026-03-09", type: "holiday", description: "March 9–13" },
  { id: "ad4", label: "Tuition Due", date: "2026-04-15", type: "tuition", description: "Spring semester tuition payment deadline" },
  { id: "ad5", label: "Withdrawal Deadline", date: "2026-04-20", type: "withdrawal", description: "Last day to withdraw with a W" },
  { id: "ad6", label: "Advising Week", date: "2026-04-06", type: "advising", description: "Meet with advisor for fall registration" },
  { id: "ad7", label: "Registration Opens", date: "2026-04-13", type: "registration", description: "Fall 2026 registration opens" },
  { id: "ad8", label: "Semester End", date: "2026-05-08", type: "semester-end" },
];

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
      { number: 4, title: "Sensation & Perception", status: "completed", notes: "Focus on signal detection theory", professorHints: [{ id: "ph1", text: "Professor said this will be on the exam — know the difference between sensation and perception", tag: "exam-hint", pinned: true, createdAt: "2026-03-20" }] },
      { number: 5, title: "States of Consciousness", status: "in-progress", notes: "Currently reviewing sleep stages", professorHints: [{ id: "ph2", text: "Review slides 15-20 for sleep cycle details", tag: "class-reminder", createdAt: "2026-04-01" }] },
      { number: 6, title: "Memory & Learning", status: "not-started", aiBreakdown: { bigIdea: "How we encode, store, and retrieve information", keyTerms: ["Encoding", "Short-term memory", "Long-term memory", "Retrieval cues", "Mnemonics"], professorCares: "Understanding the multi-store model and being able to apply encoding strategies", confusing: "The difference between recall and recognition; interference theory", practiceNext: "Practice identifying encoding types in everyday situations" } },
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
      { number: 5, title: "Cell Division", status: "in-progress", professorHints: [{ id: "ph3", text: "Know all phases of mitosis AND meiosis — he compares them on exams", tag: "exam-hint", pinned: true, createdAt: "2026-03-28" }] },
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
      { number: 3, title: "Argumentative Writing", status: "in-progress", professorHints: [{ id: "ph4", text: "Focus on essay structure — she values clear topic sentences", tag: "assignment-note", createdAt: "2026-03-30" }, { id: "ph5", text: "Citation style must be MLA. She docks points for APA.", tag: "class-reminder", pinned: true, createdAt: "2026-03-25" }] },
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
      { number: 3, title: "Quadratic Functions", status: "completed", professorHints: [{ id: "ph6", text: "He hinted at quadratic formula problems on the midterm", tag: "exam-hint", pinned: true, createdAt: "2026-03-15" }] },
      { number: 4, title: "Polynomial Functions", status: "in-progress", notes: "Need to catch up on homework", aiBreakdown: { bigIdea: "Understanding polynomial behavior through degree, zeros, and end behavior", keyTerms: ["Degree", "Leading coefficient", "Zeros", "Multiplicity", "End behavior", "Synthetic division"], professorCares: "Ability to graph polynomials by hand and find all real/complex roots", confusing: "Polynomial long division and synthetic division steps", practiceNext: "Work through factoring problems in section 4.3" } },
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
    professorHints: [{ id: "aph1", text: "She said she'll accept late drafts for half credit if submitted within 24 hours", tag: "assignment-note", createdAt: "2026-04-02" }],
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
    professorHints: [{ id: "eph1", text: "Dr. Patel said the exam will emphasize graphing and word problems", tag: "exam-hint", pinned: true, createdAt: "2026-04-01" }],
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
    professorHints: [{ id: "eph2", text: "Dr. Martinez mentioned there will be a lot of application questions — not just definitions", tag: "exam-hint", createdAt: "2026-04-03" }],
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

export const lectures: Lecture[] = [
  {
    id: "n1",
    classId: "psych101",
    className: "Intro to Psychology",
    title: "Lecture 7: Memory Models",
    date: "April 2, 2026",
    type: "recording",
    hasTranscript: true,
    hasAINotes: true,
    keyTopics: ["Short-term memory", "Encoding", "Retrieval cues"],
    transcript: "Today we're going to cover the three main models of memory. The multi-store model, proposed by Atkinson and Shiffrin, suggests that memory consists of three stores: sensory memory, short-term memory, and long-term memory. Information flows through these stores in a linear fashion. Sensory memory holds information for a very brief period — less than a second for visual information. Short-term memory can hold about 7 items, plus or minus 2, for about 20-30 seconds without rehearsal. Long-term memory has essentially unlimited capacity and duration. Encoding is the process of converting information into a form that can be stored. There are several types of encoding: visual, acoustic, and semantic. Research shows that semantic encoding — encoding based on meaning — leads to stronger memory traces. Retrieval cues are stimuli that help us access stored memories. Context-dependent memory shows that we recall information better when we're in the same environment where we learned it.",
    keyPoints: [
      "Multi-store model: sensory → short-term → long-term memory",
      "Short-term memory capacity: 7±2 items, 20-30 seconds",
      "Semantic encoding creates strongest memory traces",
      "Context-dependent memory improves recall",
      "Retrieval cues help access stored memories",
    ],
    concepts: ["Multi-store model", "Sensory memory", "Short-term memory", "Long-term memory", "Encoding types", "Retrieval cues", "Context-dependent memory"],
    professorHints: [{ id: "lph1", text: "Dr. Martinez stressed the multi-store model will be on the exam", tag: "exam-hint", pinned: true, createdAt: "2026-04-02" }],
  },
  {
    id: "n2",
    classId: "bio200",
    className: "Biology II",
    title: "Lab Session: Cell Division",
    date: "April 1, 2026",
    type: "photo",
    hasTranscript: false,
    hasAINotes: true,
    keyTopics: ["Mitosis phases", "Cytokinesis"],
    keyPoints: [
      "Mitosis has 4 phases: prophase, metaphase, anaphase, telophase",
      "Cytokinesis splits the cytoplasm after nuclear division",
      "Animal cells pinch inward; plant cells build a cell plate",
    ],
    concepts: ["Prophase", "Metaphase", "Anaphase", "Telophase", "Cytokinesis", "Cell plate", "Cleavage furrow"],
  },
  {
    id: "n3",
    classId: "math150",
    className: "College Algebra",
    title: "Chapter 4: Polynomial Functions",
    date: "March 31, 2026",
    type: "manual",
    hasTranscript: false,
    hasAINotes: false,
    keyTopics: ["Degree", "Zeros", "End behavior"],
    keyPoints: [
      "The degree of a polynomial determines end behavior",
      "Zeros are found by factoring or using the rational root theorem",
      "Multiplicity affects how the graph touches/crosses the x-axis",
    ],
    concepts: ["Degree", "Leading coefficient", "Zeros", "Multiplicity", "End behavior", "Rational root theorem"],
  },
  {
    id: "n4",
    classId: "eng102",
    className: "English Composition II",
    title: "Argumentative Essay Structure",
    date: "March 30, 2026",
    type: "pdf",
    hasTranscript: false,
    hasAINotes: true,
    keyTopics: ["Thesis statement", "Counterarguments", "Evidence"],
    keyPoints: [
      "A strong thesis takes a clear, debatable position",
      "Address counterarguments to strengthen your argument",
      "Use evidence from credible sources, properly cited in MLA",
    ],
    concepts: ["Thesis statement", "Counterargument", "Rebuttal", "Evidence", "MLA citation", "Topic sentences"],
  },
];

// Generate calendar events with proper ISO dates for week navigation
export function generateCalendarEvents(weekStart: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayName = dayNames[d.getDay()];
    const dateStr = d.toISOString().split("T")[0];

    classes.forEach(c => {
      if (c.days.includes(dayName)) {
        const hour = parseInt(c.time);
        const isPM = c.time.includes("PM") && hour !== 12;
        const h = isPM ? hour + 12 : hour;
        events.push({ id: `cal-${c.id}-${dateStr}`, day: dayName, startHour: h, duration: 1, label: c.name, type: "class", linkedId: c.id, linkedRoute: `/classes/${c.id}`, date: dateStr });
      }
    });

    workShifts.forEach(s => {
      if (s.day === dayName) {
        const startH = parseInt(s.startTime);
        const isPM = s.startTime.includes("PM") && startH !== 12;
        const endH = parseInt(s.endTime);
        const endPM = s.endTime.includes("PM") && endH !== 12;
        const start = isPM ? startH + 12 : startH;
        const end = endPM ? endH + 12 : endH;
        events.push({ id: `cal-${s.id}-${dateStr}`, day: dayName, startHour: start, duration: end - start, label: "Work", type: "work", date: dateStr });
      }
    });
  }

  return events;
}

// Legacy static events (kept for backward compat)
export const calendarEvents: CalendarEvent[] = (() => {
  const events: CalendarEvent[] = [];
  classes.forEach(c => {
    c.days.forEach(day => {
      const hour = parseInt(c.time);
      const isPM = c.time.includes("PM") && hour !== 12;
      const h = isPM ? hour + 12 : hour;
      events.push({ id: `cal-${c.id}-${day}`, day, startHour: h, duration: 1, label: c.name, type: "class", linkedId: c.id, linkedRoute: `/classes/${c.id}` });
    });
  });
  workShifts.forEach(s => {
    const startH = parseInt(s.startTime);
    const isPM = s.startTime.includes("PM") && startH !== 12;
    const endH = parseInt(s.endTime);
    const endPM = s.endTime.includes("PM") && endH !== 12;
    const start = isPM ? startH + 12 : startH;
    const end = endPM ? endH + 12 : endH;
    events.push({ id: `cal-${s.id}`, day: s.day, startHour: start, duration: end - start, label: "Work", type: "work" });
  });
  return events;
})();

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

export const eventTypeColors: Record<string, string> = {
  class: "bg-primary/15 text-primary border-primary/20",
  work: "bg-muted text-muted-foreground border-border",
  exam: "bg-danger/15 text-danger border-danger/20",
  assignment: "bg-warning/15 text-warning border-warning/20",
  study: "bg-success/15 text-success border-success/20",
  personal: "bg-accent/15 text-accent border-accent/20",
  "academic-deadline": "bg-primary/15 text-primary border-primary/20",
  payment: "bg-warning/15 text-warning border-warning/20",
  tutoring: "bg-success/15 text-success border-success/20",
  "office-hours": "bg-primary/15 text-primary border-primary/20",
};
