/**
 * Small built-in directory of real, publicly known US schools so a first-time
 * student does not have to type (and effectively create) their own school.
 *
 * Only names + state are stored on purpose: we never invent addresses,
 * enrollment, district metadata, or anything else we cannot verify.
 * The shared `schools` table still works as the community-learned fallback.
 */
export interface KnownSchool {
  name: string;
  state: string;
  kind: "high_school" | "college";
}

const UTAH_HIGH_SCHOOLS = [
  "Herriman High School",
  "Riverton High School",
  "Bingham High School",
  "Copper Hills High School",
  "West Jordan High School",
  "Jordan High School",
  "Alta High School",
  "Corner Canyon High School",
  "Brighton High School",
  "Hillcrest High School",
  "Murray High School",
  "Olympus High School",
  "Skyline High School",
  "East High School",
  "West High School",
  "Highland High School",
  "Cottonwood High School",
  "Taylorsville High School",
  "Granger High School",
  "Hunter High School",
  "Kearns High School",
  "Cyprus High School",
  "American Fork High School",
  "Lone Peak High School",
  "Pleasant Grove High School",
  "Timpanogos High School",
  "Orem High School",
  "Provo High School",
  "Timpview High School",
  "Springville High School",
  "Spanish Fork High School",
  "Salem Hills High School",
  "Payson High School",
  "Maple Mountain High School",
  "Lehi High School",
  "Skyridge High School",
  "Westlake High School",
  "Davis High School",
  "Layton High School",
  "Northridge High School",
  "Syracuse High School",
  "Clearfield High School",
  "Fremont High School",
  "Weber High School",
  "Roy High School",
  "Bonneville High School",
  "Ogden High School",
  "Ben Lomond High School",
  "Box Elder High School",
  "Bear River High School",
  "Logan High School",
  "Sky View High School",
  "Mountain Crest High School",
  "Ridgeline High School",
  "Green Canyon High School",
  "Cedar High School",
  "Canyon View High School",
  "Desert Hills High School",
  "Pine View High School",
  "Snow Canyon High School",
  "Hurricane High School",
  "Uintah High School",
  "Wasatch High School",
  "Park City High School",
  "Tooele High School",
  "Stansbury High School",
  "Grantsville High School",
];

const UTAH_COLLEGES = [
  "Utah State University",
  "University of Utah",
  "Brigham Young University",
  "Utah Valley University",
  "Weber State University",
  "Southern Utah University",
  "Utah Tech University",
  "Snow College",
  "Salt Lake Community College",
  "Westminster University",
];

export const KNOWN_SCHOOLS: KnownSchool[] = [
  ...UTAH_HIGH_SCHOOLS.map((name) => ({ name, state: "UT", kind: "high_school" as const })),
  ...UTAH_COLLEGES.map((name) => ({ name, state: "UT", kind: "college" as const })),
];

/** Words a student commonly leaves out when typing a school name. */
const OPTIONAL_WORDS = new Set(["school", "high", "senior", "the", "of", "university", "college", "hs"]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function schoolMatchKey(value: string): string {
  return tokenize(value).filter((t) => !OPTIONAL_WORDS.has(t)).join(" ");
}

/**
 * Tolerant search: every typed token must prefix-match a token in the school
 * name, so "herriman high" and "herriman" both find "Herriman High School".
 */
export function searchKnownSchools(query: string, limit = 8): KnownSchool[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored: Array<{ school: KnownSchool; score: number }> = [];

  for (const school of KNOWN_SCHOOLS) {
    const nameTokens = tokenize(school.name);
    let score = 0;
    const matched = tokens.every((token) => {
      const index = nameTokens.findIndex((n) => n.startsWith(token));
      if (index === -1) return OPTIONAL_WORDS.has(token);
      score += index === 0 ? 3 : 1;
      if (nameTokens[index] === token) score += 1;
      return true;
    });
    if (matched && score > 0) scored.push({ school, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.school.name.localeCompare(b.school.name))
    .slice(0, limit)
    .map((entry) => entry.school);
}

/** Exact-enough directory hit for canonicalizing typed input. */
export function findKnownSchool(value: string): KnownSchool | null {
  const key = schoolMatchKey(value);
  if (!key) return null;
  const exact = KNOWN_SCHOOLS.find((s) => schoolMatchKey(s.name) === key);
  if (exact) return exact;
  const matches = searchKnownSchools(value, 2);
  return matches.length === 1 ? matches[0] : null;
}
