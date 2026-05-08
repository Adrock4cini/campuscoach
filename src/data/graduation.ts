// Path to Graduation — mock data structure (ready for backend wiring)

export interface Requirement {
  id: string;
  category: "Core" | "Major" | "Elective" | "General Ed";
  name: string;
  credits: number;
  status: "completed" | "in-progress" | "planned" | "missing";
  semester?: string;
  prereqs?: string[];
}

export interface SemesterPlan {
  term: string;        // "Fall 2026"
  totalCredits: number;
  load: "light" | "balanced" | "heavy";
  classes: { name: string; credits: number; risk?: "low" | "med" | "high" }[];
  warning?: string;
}

export const degreeMeta = {
  major: "Psychology, B.A.",
  school: "State University",
  totalCreditsRequired: 120,
  creditsCompleted: 64,
  creditsInProgress: 15,
  gpa: 3.42,
  estimatedGraduation: "Spring 2028",
  pace: "+18 credits ahead of average",
};

export const requirements: Requirement[] = [
  { id: "r1", category: "Core", name: "English Composition I", credits: 3, status: "completed", semester: "Fall 2024" },
  { id: "r2", category: "Core", name: "English Composition II", credits: 3, status: "in-progress", semester: "Spring 2026" },
  { id: "r3", category: "Core", name: "College Algebra", credits: 3, status: "in-progress", semester: "Spring 2026" },
  { id: "r4", category: "Core", name: "Public Speaking", credits: 3, status: "missing" },
  { id: "r5", category: "Major", name: "Intro to Psychology", credits: 3, status: "in-progress", semester: "Spring 2026" },
  { id: "r6", category: "Major", name: "Statistics for Psych", credits: 3, status: "planned", semester: "Fall 2026", prereqs: ["College Algebra"] },
  { id: "r7", category: "Major", name: "Research Methods", credits: 3, status: "planned", semester: "Spring 2027", prereqs: ["Statistics for Psych"] },
  { id: "r8", category: "Major", name: "Cognitive Psychology", credits: 3, status: "planned", semester: "Fall 2026" },
  { id: "r9", category: "Major", name: "Abnormal Psychology", credits: 3, status: "planned", semester: "Spring 2027" },
  { id: "r10", category: "General Ed", name: "Biology II", credits: 4, status: "in-progress", semester: "Spring 2026" },
  { id: "r11", category: "General Ed", name: "World History", credits: 3, status: "completed", semester: "Fall 2025" },
  { id: "r12", category: "General Ed", name: "Art Appreciation", credits: 3, status: "missing" },
  { id: "r13", category: "Elective", name: "Sociology 101", credits: 3, status: "completed", semester: "Spring 2025" },
  { id: "r14", category: "Elective", name: "Creative Writing", credits: 3, status: "missing" },
];

export const upcomingPlan: SemesterPlan[] = [
  {
    term: "Fall 2026",
    totalCredits: 15,
    load: "balanced",
    classes: [
      { name: "Statistics for Psych", credits: 3, risk: "med" },
      { name: "Cognitive Psychology", credits: 3, risk: "low" },
      { name: "Public Speaking", credits: 3, risk: "low" },
      { name: "Art Appreciation", credits: 3, risk: "low" },
      { name: "Elective: Creative Writing", credits: 3, risk: "low" },
    ],
  },
  {
    term: "Spring 2027",
    totalCredits: 16,
    load: "heavy",
    warning: "Research Methods + Abnormal Psych together is historically heavy. Consider rebalancing.",
    classes: [
      { name: "Research Methods", credits: 3, risk: "high" },
      { name: "Abnormal Psychology", credits: 3, risk: "med" },
      { name: "Developmental Psych", credits: 3, risk: "med" },
      { name: "Philosophy of Mind", credits: 3, risk: "low" },
      { name: "Lab: Psych Methods", credits: 4, risk: "med" },
    ],
  },
];

export const aiInsights = [
  "You are 18 credits ahead of the average graduation pace 🎓",
  "Take Statistics before Research Methods — students who reverse this average 11% lower readiness.",
  "Spring 2027 is your highest-load semester. Moving Developmental Psych to Fall would balance things.",
  "You still need 1 Public Speaking credit to satisfy Core. Most students take it Sophomore year.",
];
