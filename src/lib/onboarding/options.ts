const SCHOOL_ALIASES: Record<string, string> = {
  usu: "Utah State University",
  "utah state": "Utah State University",
  "utah state university": "Utah State University",
  uofu: "University of Utah",
  "u of u": "University of Utah",
  "the university of utah": "University of Utah",
  byu: "Brigham Young University",
  "brigham young": "Brigham Young University",
};

function normalizedLookup(value: string) {
  return value.trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");
}

/** Resolve common abbreviations to one canonical school name. */
export function canonicalizeSchoolName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return SCHOOL_ALIASES[normalizedLookup(trimmed)] ?? trimmed;
}

export function academicTermOptions(now = new Date()): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentSeason = month < 4 ? "Spring" : month < 7 ? "Summer" : "Fall";
  const seasons = ["Spring", "Summer", "Fall"] as const;
  const all: string[] = [];

  for (let y = year - 1; y <= year + 2; y += 1) {
    for (const season of seasons) all.push(`${season} ${y}`);
  }

  const current = `${currentSeason} ${year}`;
  const currentIndex = all.indexOf(current);
  return all.slice(Math.max(0, currentIndex - 2), currentIndex + 6);
}
