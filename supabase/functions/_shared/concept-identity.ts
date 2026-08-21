/**
 * Deterministic concept identity.
 *
 * The brain must recognise that "14% of 50", "Percent of a Number",
 * "Finding a percentage of a number" and a textbook percent example are the
 * SAME underlying concept — otherwise every capture multiplies near-identical
 * rows, mastery is split across duplicates, and readiness silently drops.
 *
 * This layer is intentionally cheap and deterministic:
 *   - no AI call, no embedding lookup, no network
 *   - stable across captures, so the same wording always collapses
 *   - conservative: it only merges obvious aliases. Genuinely different
 *     concepts ("percent increase" vs "percent of a number") stay separate.
 *
 * Semantic near-duplicates that share no vocabulary (e.g. "part-whole
 * comparison" vs "ratio") still require embeddings — see reportable gaps.
 */

/** Words that carry no identity ("finding a percent of a number" == "percent of a number"). */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "for", "from", "in", "on", "into", "with", "and", "or",
  "how", "what", "when", "why", "is", "are", "be", "using", "use", "used",
  "find", "finding", "solve", "solving", "calculate", "calculating", "compute", "computing",
  "problem", "problems", "question", "questions", "example", "examples", "practice",
  "basic", "basics", "intro", "introduction", "review", "concept", "concepts", "key",
  "student", "students", "class", "lesson", "unit", "chapter", "topic",
]);

/** Vocabulary aliases. Left side is the surface token, right side the canonical one. */
const TOKEN_ALIASES: Record<string, string> = {
  percentage: "percent",
  percentages: "percent",
  percents: "percent",
  pct: "percent",
  fractions: "fraction",
  fractional: "fraction",
  decimals: "decimal",
  ratios: "ratio",
  proportion: "ratio",
  proportions: "ratio",
  rate: "ratio",
  rates: "ratio",
  numbers: "number",
  quantity: "number",
  quantities: "number",
  value: "number",
  values: "number",
  amount: "number",
  amounts: "number",
  total: "number",
  converting: "convert",
  conversion: "convert",
  conversions: "convert",
  converts: "convert",
  changing: "convert",
  turn: "convert",
  rewrite: "convert",
  equivalent: "convert",
  multiplying: "multiply",
  multiplication: "multiply",
  dividing: "divide",
  division: "divide",
  adding: "add",
  addition: "add",
  subtracting: "subtract",
  subtraction: "subtract",
  equations: "equation",
  variables: "variable",
};

function singularize(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses") || token.endsWith("shes") || token.endsWith("ches")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Normalises free text into canonical identity tokens. */
export function conceptTokens(value: string): string[] {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/%/g, " percent ")
    .replace(/[×x]\s*(?=\d)/g, " multiply ")
    .replace(/÷/g, " divide ")
    .replace(/\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?/g, " number ")
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens: string[] = [];
  for (const raw of normalized.split(" ")) {
    if (!raw) continue;
    const singular = singularize(raw);
    const canonical = TOKEN_ALIASES[raw] ?? TOKEN_ALIASES[singular] ?? singular;
    if (STOPWORDS.has(canonical)) continue;
    if (!tokens.includes(canonical)) tokens.push(canonical);
  }
  return tokens;
}

/**
 * The stable identity key for a concept. Two captures that describe the same
 * idea in different words produce the same key.
 */
export function conceptCanonicalKey(name: string, definition?: string | null): string {
  const tokens = conceptTokens(name);
  // A name that reduces to nothing but the numeric placeholder ("12", "3/4")
  // carries no identity of its own — keep it distinct via its definition.
  const meaningful = tokens.length > 0 && !(tokens.length === 1 && tokens[0] === "number");
  if (meaningful) return [...tokens].sort().join("-");

  // A name made only of stopwords/numbers keeps a definition-derived key so it
  // still de-duplicates against itself instead of collapsing all of them.
  const fromDefinition = conceptTokens(definition ?? "").slice(0, 6);
  if (fromDefinition.length) return [...fromDefinition].sort().join("-");
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "concept";
}

export function isSameConcept(
  left: { name: string; definition?: string | null },
  right: { name: string; definition?: string | null },
): boolean {
  return conceptCanonicalKey(left.name, left.definition)
    === conceptCanonicalKey(right.name, right.definition);
}

export interface DedupeCandidate {
  name: string;
  definition?: string | null;
  professor_emphasis?: boolean | null;
}

export interface ExistingConcept {
  id: string;
  name: string;
  definition?: string | null;
  professor_emphasis?: boolean | null;
}

export interface ConceptDedupeResult<T extends DedupeCandidate> {
  /** Candidates with no existing match — these are inserted. */
  fresh: T[];
  /** Candidates that matched a concept already in permanent memory. */
  merged: Array<{ candidate: T; conceptId: string; key: string }>;
  /** Existing concept ids that a teacher-hint candidate should now emphasise. */
  emphasiseConceptIds: string[];
}

/**
 * Collapses a freshly extracted batch against itself AND against the concepts
 * already stored for this class. Re-capturing the same page therefore
 * reinforces one concept instead of creating a second one.
 */
export function dedupeConceptCandidates<T extends DedupeCandidate>(
  candidates: readonly T[],
  existing: readonly ExistingConcept[] = [],
): ConceptDedupeResult<T> {
  const byKey = new Map<string, string>();
  const emphasisedById = new Map<string, boolean>();
  for (const concept of existing) {
    const key = conceptCanonicalKey(concept.name, concept.definition);
    if (!byKey.has(key)) byKey.set(key, concept.id);
    emphasisedById.set(concept.id, !!concept.professor_emphasis);
  }

  const fresh: T[] = [];
  const merged: Array<{ candidate: T; conceptId: string; key: string }> = [];
  const emphasise = new Set<string>();
  const seenFresh = new Set<string>();

  for (const candidate of candidates) {
    const key = conceptCanonicalKey(candidate.name, candidate.definition);
    const existingId = byKey.get(key);
    if (existingId) {
      merged.push({ candidate, conceptId: existingId, key });
      if (candidate.professor_emphasis && !emphasisedById.get(existingId)) {
        emphasise.add(existingId);
      }
      continue;
    }
    if (seenFresh.has(key)) {
      // Duplicate inside the same extraction batch.
      continue;
    }
    seenFresh.add(key);
    fresh.push(candidate);
  }

  return { fresh, merged, emphasiseConceptIds: [...emphasise] };
}
