// Scholarship system — schema + seed data only.
// External feeds / APIs / admin uploads can populate `scholarships` later.

export interface Scholarship {
  id: string;
  title: string;
  amount: number;          // USD
  deadline: string;        // ISO date
  provider: string;
  description: string;
  url?: string;
  tags: string[];          // e.g. ["STEM", "First-gen", "Women in Science"]
  eligibility: {
    majors?: string[];     // ["Psychology", "Any"]
    minGpa?: number;
    states?: string[];
    schools?: string[];
    interests?: string[];  // ["Athletics", "Volunteering", "Art"]
    demographics?: string[]; // legally-appropriate categories only
    yearLevels?: string[]; // ["Freshman", "Sophomore", ...]
  };
  effort: "low" | "medium" | "high";  // application difficulty
  recommended?: boolean;   // server-computed match
}

export const scholarships: Scholarship[] = [
  {
    id: "sc1",
    title: "Future Psychologists Award",
    amount: 2500,
    deadline: "2026-06-15",
    provider: "American Psych Foundation",
    description: "For undergrads pursuing a Psychology degree with a demonstrated interest in mental health advocacy.",
    tags: ["Psychology", "Mental Health"],
    eligibility: { majors: ["Psychology"], minGpa: 3.0, yearLevels: ["Sophomore", "Junior"] },
    effort: "medium",
    recommended: true,
  },
  {
    id: "sc2",
    title: "First-Gen College Grant",
    amount: 5000,
    deadline: "2026-05-30",
    provider: "OpenDoor Foundation",
    description: "Support for first-generation college students with financial need.",
    tags: ["First-gen", "Need-based"],
    eligibility: { minGpa: 2.5, demographics: ["First-generation"] },
    effort: "high",
    recommended: true,
  },
  {
    id: "sc3",
    title: "Campus Leadership Award",
    amount: 1000,
    deadline: "2026-07-01",
    provider: "State University Foundation",
    description: "Recognizes students with leadership roles in clubs or community service.",
    tags: ["Leadership", "Community"],
    eligibility: { schools: ["State University"], minGpa: 3.0, interests: ["Volunteering"] },
    effort: "low",
  },
  {
    id: "sc4",
    title: "Women in STEM Scholarship",
    amount: 3500,
    deadline: "2026-09-01",
    provider: "TechForward",
    description: "For women pursuing degrees in STEM fields.",
    tags: ["STEM", "Women in Science"],
    eligibility: { majors: ["Biology", "Chemistry", "Computer Science", "Engineering"], minGpa: 3.2 },
    effort: "medium",
  },
  {
    id: "sc5",
    title: "Liberal Arts Excellence",
    amount: 1500,
    deadline: "2026-08-10",
    provider: "Humanities Council",
    description: "Awarded to liberal arts students with strong writing portfolios.",
    tags: ["Liberal Arts", "Writing"],
    eligibility: { majors: ["English", "Psychology", "History", "Philosophy"], minGpa: 3.3 },
    effort: "high",
  },
  {
    id: "sc6",
    title: "Small Acts Quick Apply",
    amount: 500,
    deadline: "2026-05-20",
    provider: "Acorn Grants",
    description: "Short-form essay (250 words) — quick win.",
    tags: ["Quick Apply"],
    eligibility: { minGpa: 2.0 },
    effort: "low",
    recommended: true,
  },
];

export const allTags = Array.from(new Set(scholarships.flatMap((s) => s.tags))).sort();
export const allMajors = Array.from(
  new Set(scholarships.flatMap((s) => s.eligibility.majors ?? []))
).sort();
