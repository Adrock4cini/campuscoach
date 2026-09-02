/**
 * Subject-adaptive learning strategy profiles.
 *
 * These are CONFIGURATION for the existing Study Intelligence path, not a
 * parallel ranking system. Concept selection, mastery, and grounding are
 * unchanged; a profile only tells the generator and the Study UI which
 * formats and memory-technique families fit the material, and which are a
 * poor fit (for example: no word-root tricks for algebra).
 *
 * Classification is deterministic keyword matching over class name, code,
 * topic labels, and grounded concept names. There is no AI cost, and the
 * fallback is always the neutral `general` profile.
 *
 * IMPORTANT: this file is mirrored by `src/lib/study/subjectProfiles.ts`
 * (the app cannot import Deno function code at runtime). A parity test keeps
 * the two profile tables identical.
 */

export type StudyFormat = "flashcards" | "multiple_choice" | "matching";

export type SubjectProfileId =
  | "math"
  | "physical_science"
  | "life_science"
  | "humanities_text"
  | "history_social"
  | "business_accounting"
  | "computing"
  | "culinary"
  | "music"
  | "art_design"
  | "general";

export interface SubjectProfile {
  id: SubjectProfileId;
  label: string;
  /** One short student-facing line describing how this class is studied. */
  studyFocus: string;
  /** Study formats in preferred order. */
  preferredFormats: StudyFormat[];
  /** Formats that usually fit this material poorly (still allowed). */
  discouragedFormats: StudyFormat[];
  /** Mnemonic technique ids to prefer in Make It Stick. */
  preferredTechniques: string[];
  /** Mnemonic technique ids that usually misfire for this material. */
  avoidTechniques: string[];
  /** Guidance appended to grounded generation prompts. */
  promptGuidance: string;
  /** Deterministic classification keywords (lowercase). */
  keywords: string[];
}

export const SUBJECT_PROFILES: Record<SubjectProfileId, SubjectProfile> = {
  math: {
    id: "math",
    label: "Math & quantitative",
    studyFocus: "Worked examples and pattern practice beat vocabulary drills here.",
    preferredFormats: ["multiple_choice", "flashcards", "matching"],
    discouragedFormats: ["matching"],
    preferredTechniques: ["worked_example", "chunking", "number_shape", "association"],
    avoidTechniques: ["word_roots", "acrostic", "rhyme"],
    promptGuidance:
      "This is quantitative material. Prefer the steps, rule, or worked pattern the source shows, and test when/how a rule is applied instead of asking for a definition. Never invent numbers, results, or steps that are absent from the source.",
    keywords: [
      "math", "algebra", "geometry", "trigonometry", "trig", "precalculus", "pre-calculus",
      "calculus", "statistics", "stats", "probability", "linear algebra", "discrete math",
      "quantitative", "arithmetic",
    ],
  },
  physical_science: {
    id: "physical_science",
    label: "Physical science",
    studyFocus: "Concepts, equations, and units together — with worked problems.",
    preferredFormats: ["multiple_choice", "flashcards", "matching"],
    discouragedFormats: [],
    preferredTechniques: ["worked_example", "chunking", "compare_contrast", "visual", "number_shape"],
    avoidTechniques: ["rhyme"],
    promptGuidance:
      "This is physical-science material. Keep equations, quantities, and units exactly as written, and connect a concept to the relationship or equation the source states. Never invent a formula, constant, or unit.",
    keywords: [
      "chemistry", "chem", "physics", "physical science", "earth science", "geology",
      "astronomy", "thermodynamics", "mechanics", "organic chemistry",
    ],
  },
  life_science: {
    id: "life_science",
    label: "Life science, anatomy & health",
    studyFocus: "Terms, structures, and what each part does — visual and location cues help.",
    preferredFormats: ["flashcards", "matching", "multiple_choice"],
    discouragedFormats: [],
    preferredTechniques: ["body_map", "visual", "association", "compare_contrast", "acronym", "word_roots"],
    avoidTechniques: ["number_shape"],
    promptGuidance:
      "This is life-science, anatomy, health, or vocational body-work material. Pair each structure or term with its function, location, or procedure step exactly as the source states it. Use a word root only when the source states it.",
    keywords: [
      "biology", "bio", "biol", "anatomy", "physiology", "nursing", "health", "medical", "med term",
      "nail tech", "cosmetology", "esthetics", "dental", "microbiology", "nutrition",
      "kinesiology", "pharmacology",
    ],
  },
  humanities_text: {
    id: "humanities_text",
    label: "English, literature & writing",
    studyFocus: "Themes, evidence, and words in context — not bare definitions.",
    preferredFormats: ["multiple_choice", "flashcards", "matching"],
    discouragedFormats: ["matching"],
    preferredTechniques: ["association", "story", "compare_contrast", "familiar_bridge"],
    avoidTechniques: ["acronym", "first_letter_sentence", "number_shape"],
    promptGuidance:
      "This is literature, writing, or language material. Prefer theme, evidence, argument structure, and vocabulary used in context over one-word definitions. Quote the source's own wording when recalling a passage; never invent a quotation, author, or plot detail.",
    keywords: [
      "english", "literature", "writing", "composition", "rhetoric", "poetry", "language arts",
      "creative writing", "reading", "ela", "journalism",
    ],
  },
  history_social: {
    id: "history_social",
    label: "History & social science",
    studyFocus: "Order of events, causes and effects, and who did what.",
    preferredFormats: ["multiple_choice", "flashcards", "matching"],
    discouragedFormats: [],
    preferredTechniques: ["story", "chunking", "compare_contrast", "association", "visual"],
    avoidTechniques: ["word_roots"],
    promptGuidance:
      "This is history or social-science material. Prefer chronology, cause and effect, people and events, and comparisons between periods or systems, using only dates and names present in the source. Never invent a date, figure, or outcome.",
    keywords: [
      "history", "government", "civics", "political science", "geography", "sociology",
      "psychology", "anthropology", "world history", "us history", "social studies",
    ],
  },
  business_accounting: {
    id: "business_accounting",
    label: "Accounting, business & economics",
    studyFocus: "Rules, classifications, and worked scenarios you can repeat.",
    preferredFormats: ["multiple_choice", "matching", "flashcards"],
    discouragedFormats: [],
    preferredTechniques: ["worked_example", "chunking", "compare_contrast", "acronym", "association"],
    avoidTechniques: ["rhyme", "number_shape"],
    promptGuidance:
      "This is accounting, business, or economics material. Prefer classification rules, journal-entry or calculation scenarios, and decision patterns exactly as the source presents them. Never invent an account, amount, or rule.",
    keywords: [
      "accounting", "business", "economics", "econ", "finance", "marketing", "management",
      "entrepreneurship", "bookkeeping", "macroeconomics", "microeconomics", "debit", "debits",
      "credit", "credits", "journal entry", "journal entries", "ledger", "trial balance",
      "assets", "liabilities", "equity",
    ],
  },
  computing: {
    id: "computing",
    label: "Computers, IT & programming",
    studyFocus: "Scenarios, tracing, and troubleshooting instead of memorizing code.",
    preferredFormats: ["multiple_choice", "flashcards", "matching"],
    discouragedFormats: [],
    preferredTechniques: ["worked_example", "chunking", "association", "compare_contrast"],
    avoidTechniques: ["rhyme", "acrostic", "word_roots"],
    promptGuidance:
      "This is computing, IT, or programming material. Prefer what a command, syntax, or concept does in a scenario, plus tracing and troubleshooting steps, over rote recall of code text. Keep any command or code snippet character-exact and never invent flags, syntax, or behavior.",
    keywords: [
      "computer", "computing", "programming", "software", "coding", "information technology",
      " it ", "networking", "cybersecurity", "database", "python", "javascript", "java",
      "web development", "data science",
    ],
  },
  culinary: {
    id: "culinary",
    label: "Culinary & food service",
    studyFocus: "Steps, temperatures, timing, and safety in the right order.",
    preferredFormats: ["matching", "flashcards", "multiple_choice"],
    discouragedFormats: [],
    preferredTechniques: ["chunking", "number_shape", "story", "visual", "association"],
    avoidTechniques: ["word_roots"],
    promptGuidance:
      "This is culinary or food-service material. Prefer procedure order, temperatures, timing, safety rules, conversions, and what an ingredient or technique does. Keep every temperature, time, and measurement exactly as written; never invent one.",
    keywords: [
      "culinary", "cooking", "baking", "pastry", "food service", "servsafe", "food safety",
      "hospitality", "chef", "kitchen",
    ],
  },
  music: {
    id: "music",
    label: "Music",
    studyFocus: "Notation, theory, and terms you can hear and repeat.",
    preferredFormats: ["matching", "flashcards", "multiple_choice"],
    discouragedFormats: [],
    preferredTechniques: ["first_letter_sentence", "acrostic", "rhyme", "number_shape", "association", "chunking"],
    avoidTechniques: ["body_map"],
    promptGuidance:
      "This is music material. Prefer notation, intervals, chords, rhythm, and terminology drawn from the source, and use practice or listening prompts only when the source supports them. Never invent a note, key, or musical rule.",
    keywords: [
      "music", "music theory", "band", "orchestra", "choir", "piano", "guitar", "percussion",
      "composition studio", "solfege",
    ],
  },
  art_design: {
    id: "art_design",
    label: "Art & design",
    studyFocus: "Terms, visual elements, and comparing works or styles.",
    preferredFormats: ["flashcards", "matching", "multiple_choice"],
    discouragedFormats: [],
    preferredTechniques: ["visual", "compare_contrast", "story", "association"],
    avoidTechniques: ["number_shape"],
    promptGuidance:
      "This is art or design material. Prefer visual elements and principles, style or period comparison, artist-and-work context, and process/technique steps that appear in the source. Never invent an artist, work, date, or movement.",
    keywords: [
      "art", "art history", "design", "drawing", "painting", "sculpture", "photography",
      "graphic design", "studio art", "ceramics",
    ],
  },
  general: {
    id: "general",
    label: "General coursework",
    studyFocus: "Retrieval practice, spaced review, and short memory cues.",
    preferredFormats: ["flashcards", "multiple_choice", "matching"],
    discouragedFormats: [],
    preferredTechniques: ["association", "chunking", "story", "visual", "acronym"],
    avoidTechniques: [],
    promptGuidance:
      "Use plain retrieval practice grounded strictly in the supplied source material.",
    keywords: [],
  },
};

export const SUBJECT_PROFILE_IDS = Object.keys(SUBJECT_PROFILES) as SubjectProfileId[];

export interface SubjectClassificationInput {
  className?: string | null;
  classCode?: string | null;
  topics?: readonly (string | null | undefined)[];
  conceptNames?: readonly (string | null | undefined)[];
}

export interface SubjectClassification {
  primary: SubjectProfileId;
  secondary: SubjectProfileId[];
  /** 0-1 — how strongly the evidence matched. `general` fallback is 0. */
  confidence: number;
  matched: string[];
  source: "class-name" | "topics" | "concepts" | "fallback";
}

function normalize(value: string | null | undefined): string {
  return ` ${(value ?? "").toLowerCase().replace(/[^a-z0-9+#]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function scoreText(text: string): Map<SubjectProfileId, string[]> {
  const hits = new Map<SubjectProfileId, string[]>();
  if (text.trim().length === 0) return hits;
  for (const profile of Object.values(SUBJECT_PROFILES)) {
    for (const keyword of profile.keywords) {
      const needle = ` ${keyword.trim()} `;
      if (text.includes(needle)) {
        const list = hits.get(profile.id) ?? [];
        if (!list.includes(keyword.trim())) list.push(keyword.trim());
        hits.set(profile.id, list);
      }
    }
  }
  return hits;
}

/**
 * Deterministic subject classification. Class name/code is the strongest
 * signal, then syllabus/exam topics, then grounded concept names. Anything
 * unrecognized falls back to the neutral `general` profile.
 */
export function classifySubject(input: SubjectClassificationInput): SubjectClassification {
  const layers: Array<{ source: SubjectClassification["source"]; text: string; weight: number }> = [
    { source: "class-name", text: normalize(`${input.className ?? ""} ${input.classCode ?? ""}`), weight: 1 },
    { source: "topics", text: normalize((input.topics ?? []).filter(Boolean).join(" ")), weight: 0.8 },
    { source: "concepts", text: normalize((input.conceptNames ?? []).filter(Boolean).join(" ")), weight: 0.6 },
  ];

  for (const layer of layers) {
    const hits = scoreText(layer.text);
    if (hits.size === 0) continue;
    const ranked = [...hits.entries()].sort((a, b) => b[1].length - a[1].length);
    const [primary, matched] = ranked[0];
    const secondary = ranked.slice(1).map(([id]) => id);
    const confidence = Math.min(1, layer.weight * (0.6 + 0.2 * (matched.length - 1)));
    return { primary, secondary, confidence, matched, source: layer.source };
  }

  return { primary: "general", secondary: [], confidence: 0, matched: [], source: "fallback" };
}

export function getSubjectProfile(id: SubjectProfileId | null | undefined): SubjectProfile {
  return (id && SUBJECT_PROFILES[id]) || SUBJECT_PROFILES.general;
}

/** Study formats reordered so the profile's best fit comes first. */
export function orderStudyFormats(
  id: SubjectProfileId | null | undefined,
  formats: readonly StudyFormat[],
): StudyFormat[] {
  const profile = getSubjectProfile(id);
  const rank = (format: StudyFormat) => {
    const preferred = profile.preferredFormats.indexOf(format);
    if (preferred >= 0) return preferred;
    return profile.discouragedFormats.includes(format) ? 90 : 50;
  };
  return [...formats].sort((a, b) => rank(a) - rank(b));
}

/**
 * Merge subject technique rules with the student's own observed feedback.
 * Observed preference always wins — we adapt to what has actually worked for
 * this student rather than to any fixed "learning style" label.
 */
export function mergeTechniquePreferences(
  id: SubjectProfileId | null | undefined,
  observed: { hasFeedback: boolean; preferred: string[]; avoid: string[] },
): { preferred: string[]; avoid: string[] } {
  const profile = getSubjectProfile(id);
  const avoid = profile.avoidTechniques.filter((technique) => !observed.preferred.includes(technique));
  for (const technique of observed.avoid) {
    if (!avoid.includes(technique)) avoid.push(technique);
  }
  const preferred = [...observed.preferred];
  for (const technique of profile.preferredTechniques) {
    if (!preferred.includes(technique) && !avoid.includes(technique)) preferred.push(technique);
  }
  return { preferred, avoid };
}

/** Prompt line injected into grounded generation. */
export function subjectPromptGuidance(id: SubjectProfileId | null | undefined): string {
  const profile = getSubjectProfile(id);
  return `Subject strategy profile: ${profile.label}. ${profile.promptGuidance}`;
}
