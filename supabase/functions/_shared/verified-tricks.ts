/**
 * VERIFIED LEARNING TRICKS LIBRARY.
 *
 * A curated, static, zero-cost retrieval layer that runs BEFORE any model
 * call. When a student is working a problem and we can recognise the task
 * deterministically, a checked trick is shown instantly.
 *
 * Non-negotiable rules for anything added here:
 *   1. TIERS ARE HONEST.
 *        verified        — mathematically valid, a definition, or a fixed
 *                          convention/ordering that cannot be wrong.
 *        conditional     — useful, but only inside stated conditions, or it is
 *                          a heuristic/style choice/approximation/memory cue.
 *        study_strategy  — an evidence-based habit, NOT an instant problem
 *                          trick. Never surfaced in Assignment Help.
 *      Anything that cannot be encoded confidently is omitted — see
 *      `OMITTED_EXAMPLES`. Forty solid entries beat one hundred shaky ones.
 *   2. CONDITIONS ARE ENFORCED IN CODE, not just prose. Percent swap only
 *      matches `a% of b`; keep-change-flip only matches fraction division;
 *      FOIL only matches two binomials.
 *   3. NO NETWORK, NO AI, NO DATABASE. `selectVerifiedTricks` is pure.
 *   4. Seeing a trick is exposure, never mastery. Only a student's own correct
 *      transfer attempt is evidence (see assignmentHelpEvidence.ts).
 *
 * Mirrored to the app through `src/lib/study/verifiedTricks.ts`.
 */

import { conceptTokens } from "./concept-identity.ts";

export type TrickTier = "verified" | "conditional" | "study_strategy";

export type TrickDomain = "math" | "english" | "science" | "study";

export type TrickKind = "shortcut" | "rule" | "memory_cue" | "method";

export type TrickSourceType =
  /** Provable identity or theorem. */
  | "mathematical_identity"
  /** True by definition of the notation/operation. */
  | "definition"
  /** A fixed convention, ordering, or naming students must match. */
  | "convention"
  /** A widely used mnemonic for a real, checked ordering or fact. */
  | "curated_mnemonic"
  /** A style or editing preference, not a correctness rule. */
  | "style_guidance"
  /** Supported by learning-science evidence, not by proof. */
  | "evidence_based_method";

export interface TrickTransferCheck {
  prompt: string;
  answer: string;
}

export interface VerifiedTrick {
  id: string;
  domain: TrickDomain;
  kind: TrickKind;
  tier: TrickTier;
  title: string;
  /** Technique family, aligned with the mnemonic technique vocabulary. */
  technique: string;
  /** The trick itself, in one student-sized line. */
  trick: string;
  /** The actual reason it works. Never "it just works". */
  why: string;
  /** When it applies. */
  conditions: string;
  /** Explicit ways it can mislead. Empty only when there genuinely are none. */
  caveats: string[];
  examples: string[];
  transferCheck?: TrickTransferCheck;
  sourceType: TrickSourceType;
  /** Rough band this is useful for; informational only. */
  ageBand?: string;
  /** Concept phrasings that should retrieve this trick. */
  aliases: string[];
  /** Required literal form in the student's own problem text. */
  requirePattern?: RegExp;
  /** Disqualifying form — a different concept that shares vocabulary. */
  forbidPattern?: RegExp;
  /** Extra structural check that a regex cannot express. */
  guard?: (text: string) => boolean;
  /** Builds a worked line from the student's own numbers, when possible. */
  instance?: (text: string) => string | null;
}

/* ------------------------------------------------------------------ *
 * Patterns
 * ------------------------------------------------------------------ */

const P_PERCENT_OF = /(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/i;
const P_PERCENT_CHANGE = /percent(?:age)?\s+(increase|decrease|change|error|growth)|increased?\s+by|decreased?\s+by/i;
const P_TIMES_NINE = /(-?\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*9(?!\d)/i;
const P_TIMES_FIVE = /(-?\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*5(?!\d)/i;
const P_TIMES_ELEVEN = /(\d{2})\s*(?:x|\*|×)\s*11(?!\d)/;
const P_TIMES_25 = /(-?\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*25(?!\d)/i;
const P_SQUARE_END_5 = /(\d*[1-9]\d*5)\s*(?:\^2|²|\bsquared\b|\s*(?:x|\*|×)\s*\1)/i;
const P_DIFF_SQUARES = /([a-z]\w*|\d+)\s*(?:\^2|²)\s*[-\u2212]\s*(?:([a-z]\w*)\s*(?:\^2|²)|(\d+))/i;
const P_FRACTION_DIVISION = /(\d+\s*\/\s*\d+|\bfractions?\b)[^\n]{0,24}(÷|\/\s*\d+\s*\/|\bdivided by\b|\bdivide\b)|(÷|\bdivided by\b)[^\n]{0,16}\d+\s*\/\s*\d+/i;
const P_TWO_BINOMIALS = /\(([^()]+)\)\s*(?:x|\*|×)?\s*\(([^()]+)\)/;

/** A binomial has exactly two terms: one internal + or - sign. */
function isBinomial(factor: string): boolean {
  const terms = factor.trim().split(/\s*[+\u2212-]\s*/).filter(Boolean);
  return terms.length === 2;
}

function guardTwoBinomials(text: string): boolean {
  const m = P_TWO_BINOMIALS.exec(text);
  return !!m && isBinomial(m[1]) && isBinomial(m[2]);
}

/** Only a genuine difference of two perfect squares factors this way. */
function guardDifferenceOfSquares(text: string): boolean {
  const m = P_DIFF_SQUARES.exec(text);
  if (!m) return false;
  if (m[2]) return true;
  const constant = Number(m[3]);
  if (!Number.isFinite(constant) || constant <= 0) return false;
  const root = Math.round(Math.sqrt(constant));
  return root * root === constant;
}
const P_PROPORTION = /\d+\s*\/\s*\d*[a-z0-9]*\s*=\s*\d*[a-z0-9]*\s*\/\s*\d+|\bproportion\b|\bratios? .{0,12}equal\b/i;

/* ------------------------------------------------------------------ *
 * Instance builders (student's own numbers, always checked)
 * ------------------------------------------------------------------ */

const round = (n: number) => Math.round(n * 1e9) / 1e9;

function instancePercentSwap(text: string): string | null {
  const m = P_PERCENT_OF.exec(text);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const left = round((a / 100) * b);
  const right = round((b / 100) * a);
  if (left !== right) return null;
  return `${a}% of ${b} = ${b}% of ${a} = ${left}`;
}

function instanceTimesNine(text: string): string | null {
  const m = P_TIMES_NINE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const direct = round(n * 9);
  if (round(n * 10 - n) !== direct) return null;
  return `${n} × 9 = ${round(n * 10)} − ${n} = ${direct}`;
}

function instanceTimesFive(text: string): string | null {
  const m = P_TIMES_FIVE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const direct = round(n * 5);
  if (round((n / 2) * 10) !== direct) return null;
  return `${n} × 5 = ${round(n / 2)} × 10 = ${direct}`;
}

function instanceTimesEleven(text: string): string | null {
  const m = P_TIMES_ELEVEN.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const middle = tens + ones;
  const direct = n * 11;
  const carried = middle >= 10
    ? `${tens} | ${tens + ones} | ${ones} → carry the 1: ${direct}`
    : `${tens} | ${middle} | ${ones} = ${direct}`;
  if ((tens * 100) + (middle * 10) + ones !== direct) return null;
  return `${n} × 11: split the digits and add them in the middle — ${carried}`;
}

function instanceTimes25(text: string): string | null {
  const m = P_TIMES_25.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const direct = round(n * 25);
  if (round((n / 4) * 100) !== direct) return null;
  const friendly = n % 4 === 0 ? "" : " (not a multiple of 4, so the quarter step is a decimal)";
  return `${n} × 25 = (${round(n / 4)}) × 100 = ${direct}${friendly}`;
}

function instanceSquareEnd5(text: string): string | null {
  const m = P_SQUARE_END_5.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n % 10 !== 5) return null;
  const tens = (n - 5) / 10;
  const head = tens * (tens + 1);
  const value = (head * 100) + 25;
  if (value !== n * n) return null;
  return `${n}² : ${tens} × ${tens + 1} = ${head}, then write 25 → ${value}`;
}

/* ------------------------------------------------------------------ *
 * The library
 * ------------------------------------------------------------------ */

export const VERIFIED_TRICKS: readonly VerifiedTrick[] = [
  /* ------------------------------- MATH ------------------------------- */
  {
    id: "percent-swap",
    domain: "math",
    kind: "shortcut",
    tier: "verified",
    title: "Percent swap",
    technique: "worked_example",
    trick: "a% of b is the same as b% of a — flip it to whichever side is easier.",
    why: "a% of b means (a × b) ÷ 100. Multiplication is commutative, so (a × b) ÷ 100 = (b × a) ÷ 100. Both sides are literally the same product.",
    conditions: "Only for the form 'a% of b'. Always numerically true; it only saves time when the flipped percent is friendly (10%, 25%, 50%).",
    caveats: ["Does not apply to percent increase, percent decrease, or percent change problems."],
    examples: ["14% of 50 = 50% of 14 = 7", "8% of 25 = 25% of 8 = 2"],
    transferCheck: { prompt: "Try 18% of 50.", answer: "9 (50% of 18)" },
    sourceType: "mathematical_identity",
    aliases: ["percent of a number", "percentage of a number", "percent multiply", "percent number"],
    requirePattern: P_PERCENT_OF,
    forbidPattern: P_PERCENT_CHANGE,
    instance: instancePercentSwap,
  },
  {
    id: "times-nine",
    domain: "math",
    kind: "shortcut",
    tier: "verified",
    title: "Multiply by 9",
    technique: "worked_example",
    trick: "n × 9 = n × 10 − n.",
    why: "9 = 10 − 1, so n × 9 = n × 10 − n × 1. Distributing over the subtraction is exact.",
    conditions: "Valid for every number. Easiest when ×10 is trivial.",
    caveats: [],
    examples: ["7 × 9 = 70 − 7 = 63"],
    transferCheck: { prompt: "Try 12 × 9.", answer: "108 (120 − 12)" },
    sourceType: "mathematical_identity",
    aliases: ["multiply number", "multiply nine", "times table multiply"],
    requirePattern: P_TIMES_NINE,
    instance: instanceTimesNine,
  },
  {
    id: "times-five",
    domain: "math",
    kind: "shortcut",
    tier: "verified",
    title: "Multiply by 5",
    technique: "worked_example",
    trick: "n × 5 = half of n, then × 10.",
    why: "5 = 10 ÷ 2, so n × 5 = (n ÷ 2) × 10. Halving first keeps the digits small.",
    conditions: "Valid for any number; cleanest when n is even.",
    caveats: ["With an odd number you carry a .5 through the ×10 step."],
    examples: ["48 × 5 = 24 × 10 = 240"],
    transferCheck: { prompt: "Try 36 × 5.", answer: "180 (18 × 10)" },
    sourceType: "mathematical_identity",
    aliases: ["multiply five", "mental math multiply"],
    requirePattern: P_TIMES_FIVE,
    instance: instanceTimesFive,
  },
  {
    id: "times-eleven",
    domain: "math",
    kind: "shortcut",
    tier: "conditional",
    title: "Two-digit × 11",
    technique: "worked_example",
    trick: "Split the two digits and put their sum in the middle — carrying when the sum is 10 or more.",
    why: "For 10a + b, (10a + b) × 11 = 100a + 10(a + b) + b. The middle slot literally holds a + b, which is why a sum of 10+ has to carry into the hundreds.",
    conditions: "Two-digit whole numbers only.",
    caveats: [
      "If the digit sum is 10 or more you must carry: 57 × 11 → 5 | 12 | 7 → 627, not 5127.",
      "It does not extend to three-digit numbers without a longer rule.",
    ],
    examples: ["23 × 11 = 2 | 5 | 3 = 253", "57 × 11 = 5 | 12 | 7 → carry the 1 → 627"],
    transferCheck: { prompt: "Try 68 × 11.", answer: "748 (6 | 14 | 8, carry the 1)" },
    sourceType: "mathematical_identity",
    aliases: ["multiply eleven", "mental math multiply"],
    requirePattern: P_TIMES_ELEVEN,
    instance: instanceTimesEleven,
  },
  {
    id: "times-twenty-five",
    domain: "math",
    kind: "shortcut",
    tier: "conditional",
    title: "Multiply by 25",
    technique: "worked_example",
    trick: "n × 25 = (n ÷ 4) × 100.",
    why: "25 = 100 ÷ 4, so n × 25 = n × 100 ÷ 4. Dividing first keeps the number small.",
    conditions: "Exact for every number.",
    caveats: ["Only mental-friendly when n divides by 4; otherwise you carry a decimal quarter."],
    examples: ["36 × 25 = 9 × 100 = 900"],
    transferCheck: { prompt: "Try 16 × 25.", answer: "400 (4 × 100)" },
    sourceType: "mathematical_identity",
    aliases: ["multiply twenty five", "mental math multiply"],
    requirePattern: P_TIMES_25,
    instance: instanceTimes25,
  },
  {
    id: "square-ending-in-five",
    domain: "math",
    kind: "shortcut",
    tier: "verified",
    title: "Squaring a number ending in 5",
    technique: "worked_example",
    trick: "Take the tens digit t, compute t × (t + 1), then write 25 after it.",
    why: "(10t + 5)² = 100t² + 100t + 25 = 100·t(t+1) + 25. The last two digits are always 25 and the front is t(t+1).",
    conditions: "Whole numbers whose last digit is 5.",
    caveats: [],
    examples: ["35² : 3 × 4 = 12, then 25 → 1225"],
    transferCheck: { prompt: "Try 45².", answer: "2025 (4 × 5 = 20, then 25)" },
    sourceType: "mathematical_identity",
    aliases: ["square number", "squaring number", "square"],
    requirePattern: P_SQUARE_END_5,
    instance: instanceSquareEnd5,
  },
  {
    id: "difference-of-squares",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Difference of squares",
    technique: "worked_example",
    trick: "a² − b² = (a + b)(a − b).",
    why: "Expanding (a + b)(a − b) gives a² − ab + ab − b², and the middle terms cancel exactly.",
    conditions: "Only for a difference of two perfect squares. A sum of squares does not factor over the real numbers.",
    caveats: ["a² + b² is NOT (a + b)(a + b)."],
    examples: ["x² − 49 = (x + 7)(x − 7)", "51 × 49 = 50² − 1² = 2499"],
    transferCheck: { prompt: "Factor x² − 81.", answer: "(x + 9)(x − 9)" },
    sourceType: "mathematical_identity",
    aliases: ["difference square", "factor square", "factoring square"],
    requirePattern: P_DIFF_SQUARES,
    guard: guardDifferenceOfSquares,
  },
  {
    id: "of-means-multiply",
    domain: "math",
    kind: "rule",
    tier: "conditional",
    title: "'of' means multiply",
    technique: "worked_example",
    trick: "In 'a fraction/percent OF a quantity', 'of' means multiply.",
    why: "Taking a part of a quantity is defined as scaling it: ⅔ of 12 means ⅔ × 12.",
    conditions: "Only when a fraction, decimal, or percent is applied to a quantity.",
    caveats: [
      "'out of' signals a ratio or division (3 out of 4 = 3/4), not multiplication.",
      "'of' inside ordinary English ('the length of the table') means nothing mathematical.",
    ],
    examples: ["¾ of 20 = ¾ × 20 = 15"],
    sourceType: "definition",
    aliases: ["fraction number", "percent number", "part whole"],
  },
  {
    id: "cross-multiplication",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Cross-multiply a proportion",
    technique: "worked_example",
    trick: "If a/b = c/d, then a·d = b·c.",
    why: "Multiplying both sides of the equation by b·d clears both denominators; nothing is assumed beyond b, d ≠ 0.",
    conditions: "Only when two ratios are set EQUAL to each other, and no denominator is zero.",
    caveats: [
      "This is not a move you can make on a lone fraction or on a sum of fractions — it needs an equation of two ratios.",
    ],
    examples: ["3/4 = x/12 → 3 × 12 = 4x → x = 9"],
    transferCheck: { prompt: "Solve 2/5 = x/20.", answer: "x = 8" },
    sourceType: "mathematical_identity",
    aliases: ["ratio", "ratio equation", "cross multiply", "solve ratio"],
    requirePattern: P_PROPORTION,
  },
  {
    id: "order-of-operations",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Order of operations (PEMDAS, read carefully)",
    technique: "acronym",
    trick: "Parentheses → Exponents → Multiplication AND division left to right → Addition AND subtraction left to right.",
    why: "It is the agreed convention for reading an expression so that everyone gets the same value.",
    conditions: "Applies to evaluating any numeric or algebraic expression.",
    caveats: [
      "PEMDAS does NOT mean multiplication before division: ×  and ÷ share one level, done left to right (8 ÷ 4 × 2 = 4, not 1).",
      "Addition and subtraction also share one level, left to right (10 − 3 + 2 = 9, not 5).",
    ],
    examples: ["8 ÷ 4 × 2 = 2 × 2 = 4", "10 − 3 + 2 = 7 + 2 = 9"],
    transferCheck: { prompt: "Evaluate 12 ÷ 3 × 2.", answer: "8 — left to right, not 12 ÷ 6" },
    sourceType: "convention",
    aliases: ["order operation", "pemdas", "bodmas", "evaluate expression"],
  },
  {
    id: "keep-change-flip",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Keep, change, flip",
    technique: "worked_example",
    trick: "Dividing by a fraction: keep the first, change ÷ to ×, flip the second.",
    why: "Dividing by d is defined as multiplying by 1/d, and the reciprocal of a/b is b/a.",
    conditions: "Only for division BY a fraction. The divisor must not be zero.",
    caveats: [
      "Do not flip anything when multiplying fractions — just multiply straight across.",
      "Do not flip when adding or subtracting fractions; those need a common denominator.",
    ],
    examples: ["3/4 ÷ 2/5 = 3/4 × 5/2 = 15/8"],
    transferCheck: { prompt: "Try 1/2 ÷ 1/4.", answer: "2 (1/2 × 4/1)" },
    sourceType: "definition",
    aliases: ["divide fraction", "fraction divide", "reciprocal divide"],
    requirePattern: P_FRACTION_DIVISION,
  },
  {
    id: "percent-decimal-move",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Percent ↔ decimal",
    technique: "worked_example",
    trick: "Percent → decimal: move the point two places left. Decimal → percent: two places right.",
    why: "Percent means 'per hundred', so p% = p ÷ 100 by definition, and dividing by 100 shifts the decimal two places.",
    conditions: "Any percent or decimal.",
    caveats: ["Watch percents below 1: 0.5% = 0.005, not 0.5."],
    examples: ["37% = 0.37", "0.045 = 4.5%"],
    transferCheck: { prompt: "Write 6% as a decimal.", answer: "0.06" },
    sourceType: "definition",
    aliases: ["convert percent decimal", "percent decimal", "decimal percent"],
  },
  {
    id: "divisibility-3",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Divisible by 3",
    technique: "worked_example",
    trick: "Add the digits. If that sum is divisible by 3, so is the number.",
    why: "10 ≡ 1 (mod 3), so every place value contributes just its digit; the number and its digit sum leave the same remainder.",
    conditions: "Whole numbers.",
    caveats: [],
    examples: ["471 → 4 + 7 + 1 = 12 → divisible by 3"],
    transferCheck: { prompt: "Is 522 divisible by 3?", answer: "Yes — 5 + 2 + 2 = 9" },
    sourceType: "mathematical_identity",
    aliases: ["divisibility", "divisibility rule", "divisible"],
  },
  {
    id: "divisibility-4",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Divisible by 4",
    technique: "worked_example",
    trick: "Look at the last two digits only. If they form a multiple of 4, the whole number is.",
    why: "100 is divisible by 4, so everything above the tens place is already a multiple of 4; only the last two digits can change the remainder.",
    conditions: "Whole numbers.",
    caveats: [],
    examples: ["9,316 → 16 is a multiple of 4 → divisible by 4"],
    transferCheck: { prompt: "Is 1,530 divisible by 4?", answer: "No — 30 is not a multiple of 4" },
    sourceType: "mathematical_identity",
    aliases: ["divisibility", "divisibility rule", "divisible"],
  },
  {
    id: "divisibility-8",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Divisible by 8",
    technique: "worked_example",
    trick: "Look at the last three digits. If they form a multiple of 8, the number is.",
    why: "1000 is divisible by 8, so only the last three digits affect the remainder.",
    conditions: "Whole numbers.",
    caveats: [],
    examples: ["12,344 → 344 ÷ 8 = 43 → divisible by 8"],
    sourceType: "mathematical_identity",
    aliases: ["divisibility", "divisibility rule", "divisible"],
  },
  {
    id: "divisibility-9",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Divisible by 9",
    technique: "worked_example",
    trick: "Add the digits. If the sum is divisible by 9, so is the number.",
    why: "10 ≡ 1 (mod 9), so the number and its digit sum share a remainder mod 9.",
    conditions: "Whole numbers.",
    caveats: [],
    examples: ["8,127 → 8 + 1 + 2 + 7 = 18 → divisible by 9"],
    sourceType: "mathematical_identity",
    aliases: ["divisibility", "divisibility rule", "divisible"],
  },
  {
    id: "divisibility-11",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Divisible by 11",
    technique: "worked_example",
    trick: "Alternately subtract and add the digits. If the result is 0 or a multiple of 11, the number is.",
    why: "10 ≡ −1 (mod 11), so place values alternate sign; the alternating digit sum keeps the same remainder mod 11.",
    conditions: "Whole numbers.",
    caveats: ["The alternating result can be negative — judge its absolute value."],
    examples: ["2,915 → 2 − 9 + 1 − 5 = −11 → divisible by 11"],
    sourceType: "mathematical_identity",
    aliases: ["divisibility", "divisibility rule", "divisible"],
  },
  {
    id: "casting-out-nines",
    domain: "math",
    kind: "method",
    tier: "conditional",
    title: "Casting out nines",
    technique: "worked_example",
    trick: "Reduce each number to its digit sum mod 9 and redo the operation on those small numbers as a check.",
    why: "Digit sums preserve remainders mod 9, so a correct calculation must agree mod 9.",
    conditions: "Use as a quick error check after you already have an answer.",
    caveats: [
      "It can only detect errors, never prove correctness — an answer wrong by a multiple of 9, or with two digits swapped, passes the check.",
    ],
    examples: ["47 × 8 = 376 → (2 × 8 = 16 → 7) and (3 + 7 + 6 = 16 → 7) — consistent"],
    sourceType: "mathematical_identity",
    aliases: ["check answer", "checking answer", "error check arithmetic", "casting out nine"],
  },
  {
    id: "foil-binomials",
    domain: "math",
    kind: "rule",
    tier: "conditional",
    title: "FOIL (two binomials only)",
    technique: "acronym",
    trick: "First, Outer, Inner, Last — multiply each pair, then combine like terms.",
    why: "FOIL is just the distributive property applied to exactly two two-term factors.",
    conditions: "Only for multiplying two binomials.",
    caveats: [
      "FOIL breaks the moment a factor has three or more terms — use the distributive property, which is the general principle.",
    ],
    examples: ["(x + 3)(x − 2) = x² − 2x + 3x − 6 = x² + x − 6"],
    transferCheck: { prompt: "Expand (x + 5)(x + 2).", answer: "x² + 7x + 10" },
    sourceType: "mathematical_identity",
    aliases: ["multiply binomial", "expand bracket", "distributive multiply"],
    requirePattern: P_TWO_BINOMIALS,
    guard: guardTwoBinomials,
  },
  {
    id: "slope-rise-run",
    domain: "math",
    kind: "rule",
    tier: "verified",
    title: "Slope is rise over run",
    technique: "worked_example",
    trick: "slope = rise ÷ run = (y₂ − y₁) ÷ (x₂ − x₁).",
    why: "Slope is defined as the vertical change per unit of horizontal change.",
    conditions: "Any straight line where the two x-values differ.",
    caveats: ["A vertical line has run = 0, so its slope is undefined, not zero."],
    examples: ["(1, 2) to (4, 8): rise 6, run 3 → slope 2"],
    transferCheck: { prompt: "Slope from (0, 1) to (2, 7)?", answer: "3" },
    sourceType: "definition",
    aliases: ["slope", "slope line", "rise run", "linear equation slope"],
  },
  {
    id: "rule-of-72",
    domain: "math",
    kind: "shortcut",
    tier: "conditional",
    title: "Rule of 72",
    technique: "worked_example",
    trick: "Doubling time ≈ 72 ÷ interest rate (in percent).",
    why: "It approximates ln(2)/ln(1 + r) for small rates; 72 is chosen because it divides cleanly.",
    conditions: "Compound growth at a roughly steady rate, best between about 5% and 12%.",
    caveats: [
      "It is an approximation, not an exact answer — never use it where the exam wants the compound-interest formula.",
    ],
    examples: ["8% per year → about 9 years to double"],
    sourceType: "mathematical_identity",
    aliases: ["compound interest", "double interest", "exponential growth interest"],
  },

  /* ------------------------------ ENGLISH ----------------------------- */
  {
    id: "affect-effect",
    domain: "english",
    kind: "memory_cue",
    tier: "conditional",
    title: "Affect vs. effect",
    technique: "sound_alike",
    trick: "Affect = Action (usually the verb). Effect = End result (usually the noun).",
    why: "In everyday writing the verb is 'affect' and the noun is 'effect', so the A/E cue matches the common case.",
    conditions: "Use for ordinary sentences while drafting or editing.",
    caveats: [
      "'Effect' is also a verb meaning to bring about ('effect change').",
      "'Affect' is a noun in psychology, meaning observable emotion.",
    ],
    examples: ["The rain will affect the game. The effect was obvious."],
    transferCheck: { prompt: "Sleep ___s your focus.", answer: "affect (it is the action)" },
    sourceType: "curated_mnemonic",
    aliases: ["affect effect", "commonly confused word", "homophone"],
  },
  {
    id: "stationery-stationary",
    domain: "english",
    kind: "memory_cue",
    tier: "verified",
    title: "Stationery vs. stationary",
    technique: "sound_alike",
    trick: "StationERy has an E for Envelope. StationARy has an A for stAnd still.",
    why: "The cue attaches each spelling to its own meaning through a letter that appears in the matching word.",
    conditions: "Spelling choice only.",
    caveats: [],
    examples: ["I bought stationery. The car stayed stationary."],
    sourceType: "curated_mnemonic",
    aliases: ["stationery stationary", "commonly confused word", "spelling"],
  },
  {
    id: "dessert-desert",
    domain: "english",
    kind: "memory_cue",
    tier: "verified",
    title: "Dessert vs. desert",
    technique: "sound_alike",
    trick: "Dessert has two S's because you want seconds.",
    why: "The doubled S is the only spelling difference, and 'seconds' pins it to the sweet meaning.",
    conditions: "Spelling choice only.",
    caveats: [],
    examples: ["We shared dessert. They crossed the desert."],
    sourceType: "curated_mnemonic",
    aliases: ["dessert desert", "commonly confused word", "spelling"],
  },
  {
    id: "principal-principle",
    domain: "english",
    kind: "memory_cue",
    tier: "conditional",
    title: "Principal vs. principle",
    technique: "sound_alike",
    trick: "The principAL is your pAL; a principLE is a ruLE.",
    why: "Each ending is tied to a word that carries its meaning.",
    conditions: "Spelling choice only.",
    caveats: ["'Principal' also means the main amount of a loan and 'main' as an adjective."],
    examples: ["The principal spoke. It's a matter of principle."],
    sourceType: "curated_mnemonic",
    aliases: ["principal principle", "commonly confused word", "spelling"],
  },
  {
    id: "its-vs-its",
    domain: "english",
    kind: "rule",
    tier: "verified",
    title: "its vs. it's",
    technique: "worked_example",
    trick: "If you can say 'it is' or 'it has', write it's. Otherwise write its.",
    why: "The apostrophe marks a contraction; the possessive 'its' has no apostrophe, like 'his' and 'hers'.",
    conditions: "Any sentence using its/it's.",
    caveats: [],
    examples: ["It's raining (it is). The dog wagged its tail."],
    transferCheck: { prompt: "___ been a long week.", answer: "It's (it has)" },
    sourceType: "definition",
    aliases: ["apostrophe", "possessive contraction", "its", "commonly confused word"],
  },
  {
    id: "their-there-theyre",
    domain: "english",
    kind: "memory_cue",
    tier: "verified",
    title: "their / there / they're",
    technique: "sound_alike",
    trick: "theRE points to a placE (like heRE). they're = they are. their shows ownership — it has 'heir'.",
    why: "Each spelling maps to a different grammatical job, and each cue lives inside the word itself.",
    conditions: "Spelling choice only.",
    caveats: [],
    examples: ["They're over there with their bags."],
    sourceType: "curated_mnemonic",
    aliases: ["their there", "homophone", "commonly confused word"],
  },
  {
    id: "lose-loose",
    domain: "english",
    kind: "memory_cue",
    tier: "verified",
    title: "lose vs. loose",
    technique: "sound_alike",
    trick: "Loose has an extra O — it is too big and slips off. Lose lost an O.",
    why: "The letter count itself carries the meaning difference.",
    conditions: "Spelling choice only.",
    caveats: [],
    examples: ["Don't lose the key. The screw is loose."],
    sourceType: "curated_mnemonic",
    aliases: ["lose loose", "commonly confused word", "spelling"],
  },
  {
    id: "complement-compliment",
    domain: "english",
    kind: "memory_cue",
    tier: "verified",
    title: "complement vs. compliment",
    technique: "sound_alike",
    trick: "ComplEment complEtes. ComplIment is somethIng nice I say.",
    why: "The differing vowel is tied to a word that shares it and carries the meaning.",
    conditions: "Spelling choice only.",
    caveats: [],
    examples: ["The sauce complements the dish. She paid me a compliment."],
    sourceType: "curated_mnemonic",
    aliases: ["complement compliment", "commonly confused word", "spelling"],
  },
  {
    id: "silent-e",
    domain: "english",
    kind: "rule",
    tier: "conditional",
    title: "Silent e lengthens the vowel",
    technique: "sound_alike",
    trick: "A final silent e often makes the vowel before it say its own name: hop → hope.",
    why: "It is an inherited spelling pattern that marks a long vowel in many English words.",
    conditions: "A useful default for decoding unfamiliar one-syllable words.",
    caveats: [
      "Not universal — have, give, come, done, love all break it. Treat it as a first guess, not a rule.",
    ],
    examples: ["cap → cape, kit → kite"],
    sourceType: "curated_mnemonic",
    aliases: ["silent e", "long vowel", "phonics vowel", "spelling pattern"],
  },
  {
    id: "oxford-comma",
    domain: "english",
    kind: "rule",
    tier: "conditional",
    title: "Oxford comma",
    technique: "worked_example",
    trick: "A comma before 'and' in a list can remove ambiguity — but it is a style choice.",
    why: "Some style guides (Chicago, APA) require it; others (AP) drop it. Both are grammatical.",
    conditions: "Follow whichever style your teacher or class assigns, and be consistent.",
    caveats: ["Never mark it wrong as a grammar error — it is not a correctness rule."],
    examples: ["I invited my parents, Ada, and Lin. (Without the comma: my parents named Ada and Lin.)"],
    sourceType: "style_guidance",
    aliases: ["comma list", "oxford comma", "serial comma", "punctuation list"],
  },
  {
    id: "active-voice",
    domain: "english",
    kind: "method",
    tier: "conditional",
    title: "Active voice as an editing pass",
    technique: "worked_example",
    trick: "If you can add 'by zombies' after the verb, it is passive — consider naming the doer instead.",
    why: "Passive voice hides the actor, which usually costs clarity in student writing.",
    conditions: "An editing heuristic for drafts.",
    caveats: [
      "Passive is correct and often preferred in lab reports and when the actor is unknown or irrelevant.",
    ],
    examples: ["The ball was thrown (by zombies) → Maya threw the ball."],
    sourceType: "style_guidance",
    aliases: ["passive voice", "active voice", "revise writing", "essay revision"],
  },

  /* ------------------------------ SCIENCE ----------------------------- */
  {
    id: "taxonomy-order",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "Taxonomy ranks in order",
    technique: "first_letter_sentence",
    trick: "Dear King Philip Came Over For Good Soup — Domain, Kingdom, Phylum, Class, Order, Family, Genus, Species.",
    why: "The initials match the standard rank order from broadest to most specific.",
    conditions: "Recalling the ordering of the classification ranks.",
    caveats: ["It gives the order only, not what each rank means."],
    examples: ["Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species"],
    transferCheck: { prompt: "Which rank sits between Order and Genus?", answer: "Family" },
    sourceType: "curated_mnemonic",
    aliases: ["taxonomy", "classification rank", "taxonomy classification", "biological classification"],
  },
  {
    id: "roy-g-biv",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "ROY G. BIV",
    technique: "acronym",
    trick: "Red, Orange, Yellow, Green, Blue, Indigo, Violet — visible light from longest to shortest wavelength.",
    why: "The initials give the standard spectrum order, which is also the order of decreasing wavelength.",
    conditions: "The visible spectrum.",
    caveats: ["Indigo is a traditional band, not a distinct physical boundary."],
    examples: ["Red has the longest wavelength; violet the shortest."],
    transferCheck: { prompt: "Which has the longer wavelength, green or blue?", answer: "Green" },
    sourceType: "curated_mnemonic",
    aliases: ["visible light spectrum", "light spectrum", "wavelength color", "rainbow color order"],
  },
  {
    id: "metric-prefixes",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "Metric prefix ladder",
    technique: "first_letter_sentence",
    trick: "King Henry Died By Drinking Chocolate Milk — kilo, hecto, deca, base, deci, centi, milli.",
    why: "Each step is a factor of 10, so moving one rung moves the decimal point one place.",
    conditions: "Conversions inside the kilo-to-milli range.",
    caveats: ["It does not cover micro, nano, mega or giga — those jump by factors of 1000."],
    examples: ["2.5 km → 2500 m (three rungs right)"],
    transferCheck: { prompt: "How many cm in 3 m?", answer: "300" },
    sourceType: "curated_mnemonic",
    aliases: ["metric unit", "metric convert", "unit convert", "metric prefix"],
  },
  {
    id: "mitosis-pmat",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "PMAT — mitosis phases",
    technique: "acronym",
    trick: "Prophase, Metaphase, Anaphase, Telophase.",
    why: "The initials give the standard phase order taught for mitosis.",
    conditions: "Ordering the phases of mitosis.",
    caveats: ["Interphase comes before PMAT, and cytokinesis overlaps telophase — PMAT alone is not the whole cycle."],
    examples: ["Metaphase: chromosomes line up in the middle."],
    transferCheck: { prompt: "Which phase follows metaphase?", answer: "Anaphase" },
    sourceType: "curated_mnemonic",
    aliases: ["mitosis", "mitosis phase", "cell division phase", "cell cycle phase"],
  },
  {
    id: "oil-rig",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "OIL RIG",
    technique: "acronym",
    trick: "Oxidation Is Loss of electrons, Reduction Is Gain of electrons.",
    why: "Oxidation and reduction are defined by electron transfer, and the acronym states the definitions exactly.",
    conditions: "Redox reactions and oxidation numbers.",
    caveats: ["'Gain' means gain of electrons, which lowers the oxidation number — the wording can feel backwards."],
    examples: ["Zn → Zn²⁺ + 2e⁻ is oxidation (loss)."],
    transferCheck: { prompt: "A species gains electrons. Oxidised or reduced?", answer: "Reduced" },
    sourceType: "curated_mnemonic",
    aliases: ["redox", "oxidation reduction", "electron transfer", "oxidation number"],
  },
  {
    id: "concave-caves-in",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "Concave caves in",
    technique: "sound_alike",
    trick: "A concave surface caves inward; a convex one bulges out.",
    why: "The word 'concave' contains 'cave', which matches the inward curve.",
    conditions: "Naming mirror and lens shapes.",
    caveats: ["The shape name alone does not tell you whether the image is real or virtual."],
    examples: ["A spoon's inner side is concave."],
    sourceType: "curated_mnemonic",
    aliases: ["concave convex", "mirror lens", "lens shape", "optic mirror"],
  },
  {
    id: "food-chain-arrows",
    domain: "science",
    kind: "rule",
    tier: "verified",
    title: "Food-chain arrows",
    technique: "visual",
    trick: "The arrow points in the direction energy moves — from the organism eaten toward the one that eats it.",
    why: "A food chain diagrams energy transfer, so the arrowhead marks the receiver of the energy.",
    conditions: "Reading or drawing food chains and webs.",
    caveats: ["It is easy to draw it backwards by thinking 'eats' — the arrow means 'gives energy to'."],
    examples: ["grass → rabbit → fox"],
    transferCheck: { prompt: "Which way does the arrow point between algae and a fish that eats it?", answer: "From the algae to the fish" },
    sourceType: "definition",
    aliases: ["food chain", "food web", "energy transfer ecosystem", "trophic level"],
  },
  {
    id: "mitochondria-powerhouse",
    domain: "science",
    kind: "memory_cue",
    tier: "conditional",
    title: "Mitochondria: the 'powerhouse'",
    technique: "association",
    trick: "Mitochondria are the cell's powerhouse.",
    why: "It attaches the organelle to its most testable function: producing ATP.",
    conditions: "Recalling which organelle supplies cellular energy.",
    caveats: [
      "It is a memory cue, not an explanation — the real answer involves aerobic respiration and ATP synthesis, and mitochondria also handle signalling and apoptosis.",
    ],
    examples: ["Mitochondria → ATP → energy for the cell."],
    sourceType: "curated_mnemonic",
    aliases: ["mitochondria", "organelle function", "cell organelle", "cell structure"],
  },
  {
    id: "dna-base-pairing",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "DNA base pairing",
    technique: "association",
    trick: "Apple in the Tree (A–T), Car in the Garage (C–G).",
    why: "Complementary pairing is fixed by hydrogen bonding: A pairs with T, C pairs with G.",
    conditions: "DNA. In RNA, A pairs with U instead of T.",
    caveats: ["Do not carry A–T into RNA transcription questions."],
    examples: ["Template ATCG → complement TAGC"],
    transferCheck: { prompt: "What pairs with C?", answer: "G" },
    sourceType: "curated_mnemonic",
    aliases: ["dna base pair", "base pairing", "complementary strand", "dna replication pair"],
  },
  {
    id: "planet-order",
    domain: "science",
    kind: "memory_cue",
    tier: "verified",
    title: "Planet order",
    technique: "first_letter_sentence",
    trick: "My Very Educated Mother Just Served Us Noodles — Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.",
    why: "The initials give the planets in order of distance from the Sun.",
    conditions: "The eight planets.",
    caveats: ["Pluto is a dwarf planet and is not in the list."],
    examples: ["Fourth from the Sun: Mars."],
    sourceType: "curated_mnemonic",
    aliases: ["planet order", "solar system planet", "planet distance sun"],
  },

  /* -------------------- STUDY STRATEGIES (not instant) ---------------- */
  {
    id: "retrieval-practice",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Retrieval practice",
    technique: "worked_example",
    trick: "Close the book and write what you remember before rereading.",
    why: "Pulling information out strengthens the memory far more than putting it in again; rereading mostly builds false confidence.",
    conditions: "Any material you need to recall later.",
    caveats: ["It feels harder than rereading — that difficulty is the mechanism, not a sign it is failing."],
    examples: ["Blank-page recall, then check against notes and mark the gaps."],
    sourceType: "evidence_based_method",
    aliases: ["study method", "revise", "memorize", "study technique"],
  },
  {
    id: "spaced-practice",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Spaced practice",
    technique: "chunking",
    trick: "Three 20-minute sessions across three days beat one 60-minute cram.",
    why: "Letting memory decay slightly before restudying forces a stronger reconstruction each time.",
    conditions: "Works when you start more than a couple of days before the test.",
    caveats: ["The night before an exam, spacing is no longer available — use retrieval practice instead."],
    examples: ["Mon / Wed / Fri instead of Thursday night."],
    sourceType: "evidence_based_method",
    aliases: ["study schedule", "cram", "study plan", "spaced repetition"],
  },
  {
    id: "interleaving",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Interleaving",
    technique: "compare_contrast",
    trick: "Mix problem types in one session instead of doing twenty of the same kind.",
    why: "Mixing forces you to choose the method, which is the skill the test actually measures.",
    conditions: "Best once you know each method individually.",
    caveats: ["Accuracy drops during practice even though test performance improves — don't read that as failure."],
    examples: ["Alternate factoring, quadratic formula, and completing the square."],
    sourceType: "evidence_based_method",
    aliases: ["practice problem", "problem set", "study technique"],
  },
  {
    id: "dual-coding",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Dual coding",
    technique: "visual",
    trick: "Pair the words with your own quick sketch or diagram.",
    why: "Verbal and visual representations are stored differently, giving you two routes back to the same idea.",
    conditions: "Material with structure, flow, or parts.",
    caveats: ["It is not a 'visual learner' label — it helps most students, and decorative images do not count."],
    examples: ["Redraw the cell cycle from memory, then label it."],
    sourceType: "evidence_based_method",
    aliases: ["diagram", "sketch note", "visual note", "study technique"],
  },
  {
    id: "chunking-method",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Chunking",
    technique: "chunking",
    trick: "Group a long list into 3–4 meaningful groups before memorising.",
    why: "Working memory holds only a few items, but each item can be a group.",
    conditions: "Long lists, digit strings, term sets.",
    caveats: ["Groups have to be meaningful — arbitrary splits do not help."],
    examples: ["Twelve terms → three themed groups of four."],
    sourceType: "evidence_based_method",
    aliases: ["memorize list", "long list", "study technique"],
  },
  {
    id: "feynman-method",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Feynman explanation",
    technique: "worked_example",
    trick: "Explain it out loud as if to a younger student; the sentence where you stumble is the gap.",
    why: "Simplifying requires the underlying structure, so it exposes memorised wording that hides missing understanding.",
    conditions: "Concepts, not raw vocabulary.",
    caveats: ["It shows the gap; you still have to go back to the source to fill it."],
    examples: ["Explain osmosis in two sentences with no textbook words."],
    sourceType: "evidence_based_method",
    aliases: ["explain concept", "understand concept", "study technique"],
  },
  {
    id: "error-analysis",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Error analysis",
    technique: "compare_contrast",
    trick: "For each miss, label it: careless slip, wrong method, or didn't know.",
    why: "The three causes need three different fixes; treating them all as 'study more' wastes the session.",
    conditions: "After any practice set, quiz, or returned test.",
    caveats: [],
    examples: ["Six misses: 4 slips → slow down; 2 wrong method → relearn that step."],
    sourceType: "evidence_based_method",
    aliases: ["review mistake", "test correction", "practice test review", "study technique"],
  },
  {
    id: "method-of-loci",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Memory palace (loci)",
    technique: "story",
    trick: "Place each item along a route you know well, then walk the route to recall them in order.",
    why: "Spatial memory is unusually durable and gives ordered items a fixed retrieval cue.",
    conditions: "Ordered lists you must reproduce in sequence.",
    caveats: ["Setup takes time; it is overkill for a handful of terms."],
    examples: ["Eight taxonomy ranks along your walk to class."],
    sourceType: "evidence_based_method",
    aliases: ["memorize order", "memorize sequence", "memory palace", "study technique"],
  },
  {
    id: "sleep-consolidation",
    domain: "study",
    kind: "method",
    tier: "study_strategy",
    title: "Sleep consolidates what you studied",
    technique: "worked_example",
    trick: "Finish studying before sleep rather than trading sleep for one more hour.",
    why: "Memory consolidation happens during sleep, so the lost hour usually costs more than it adds.",
    conditions: "A study-habit choice, never a problem-solving trick.",
    caveats: ["This is a habit, not a concept cue — it never appears as an in-problem shortcut."],
    examples: ["Review the hard set, then stop."],
    sourceType: "evidence_based_method",
    aliases: ["cram all night", "study late", "study habit"],
  },
];

/**
 * Patterns from the seed list that were deliberately NOT encoded, with the
 * reason. Kept in code so nobody re-adds them "because they're famous".
 */
export const OMITTED_EXAMPLES: ReadonlyArray<{ id: string; reason: string }> = [
  {
    id: "i-before-e",
    reason: "'I before E except after C' has so many exceptions (weird, their, science, seize, height) that it misleads more than it helps. Not encodable as a verified rule.",
  },
  {
    id: "fake-etymology",
    reason: "Invented word origins ('golf = Gentlemen Only, Ladies Forbidden') are false. Etymology is only allowed when it comes from a real source in the student's material.",
  },
  {
    id: "learning-styles",
    reason: "Matching teaching to a fixed 'visual/auditory/kinesthetic learner' type is not supported by evidence. We rank by observed effectiveness instead, never by a label.",
  },
  {
    id: "left-brain-right-brain",
    reason: "Creative/logical hemisphere typing is a myth and would encourage fixed self-labels.",
  },
  {
    id: "always-multiply-when-you-see-of",
    reason: "Encoded only in its conditional form; the unconditional version breaks on 'out of' and on ordinary English usage.",
  },
  {
    id: "double-negative-always-wrong",
    reason: "Register-dependent, and in logic and mathematics a double negative is meaningful. Not a correctness rule.",
  },
];

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

export interface TrickQuery {
  /** Concept name, if the brain already identified one. */
  conceptName?: string | null;
  /** The exact thing being learned / the problem text. */
  problemText?: string | null;
  /** Grounded source excerpt, if any. */
  sourceExcerpt?: string | null;
  /** Restrict to a domain when the subject is known. */
  domain?: TrickDomain | null;
}

export interface TrickSelectOptions {
  /** Technique families this student has actually responded to, best first. */
  preferredTechniques?: readonly string[];
  /** Include the study-habit tier. Off by default: not an in-problem trick. */
  includeStudyStrategies?: boolean;
  max?: number;
}

export interface TrickMatch {
  trick: VerifiedTrick;
  /** Worked line built from the student's own numbers, when available. */
  workedExample: string | null;
  /** Why this matched — QA and disclosure. */
  matchedOn: "pattern" | "alias";
  score: number;
}

function haystack(query: TrickQuery): string {
  return [query.conceptName, query.problemText, query.sourceExcerpt]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n")
    .slice(0, 4000);
}

function aliasHit(aliases: readonly string[], tokens: readonly string[]): boolean {
  for (const alias of aliases) {
    const aliasTokens = conceptTokens(alias);
    if (!aliasTokens.length) continue;
    if (aliasTokens.every((token) => tokens.includes(token))) return true;
  }
  return false;
}

const TIER_SCORE: Record<TrickTier, number> = {
  verified: 100,
  conditional: 60,
  study_strategy: 20,
};

/**
 * Pure, deterministic library lookup. No model call, no network, no I/O.
 * Returns the applicable tricks best-first.
 */
export function selectVerifiedTricks(
  query: TrickQuery,
  options: TrickSelectOptions = {},
): TrickMatch[] {
  const text = haystack(query);
  if (!text.trim()) return [];
  const tokens = conceptTokens(text);
  const preferred = options.preferredTechniques ?? [];
  const matches: TrickMatch[] = [];

  for (const trick of VERIFIED_TRICKS) {
    if (trick.tier === "study_strategy" && !options.includeStudyStrategies) continue;
    if (query.domain && trick.domain !== query.domain && trick.domain !== "study") continue;
    if (trick.forbidPattern?.test(text)) continue;

    const patternHit = trick.requirePattern ? trick.requirePattern.test(text) : false;
    // A trick with a required form is disqualified unless that form is present,
    // no matter how well the vocabulary matches.
    if (trick.requirePattern && !patternHit) continue;
    if (trick.guard && !trick.guard(text)) continue;
    const alias = aliasHit(trick.aliases, tokens);
    if (!patternHit && !alias) continue;

    const preferenceIndex = preferred.indexOf(trick.technique);
    matches.push({
      trick,
      workedExample: trick.instance?.(text) ?? null,
      matchedOn: patternHit ? "pattern" : "alias",
      score: TIER_SCORE[trick.tier]
        + (patternHit ? 25 : 0)
        + (preferenceIndex >= 0 ? Math.max(1, 8 - preferenceIndex) : 0),
    });
  }

  matches.sort((a, b) => b.score - a.score || a.trick.id.localeCompare(b.trick.id));
  return matches.slice(0, Math.max(1, options.max ?? 3));
}

/** The single best applicable trick, or null when nothing is safe to show. */
export function selectVerifiedTrick(
  query: TrickQuery,
  options: TrickSelectOptions = {},
): TrickMatch | null {
  return selectVerifiedTricks(query, { ...options, max: 1 })[0] ?? null;
}

/** Card label for the UI, honest about what kind of help this is. */
export function trickCardLabel(trick: VerifiedTrick): string {
  if (trick.tier === "study_strategy") return "Study method";
  if (trick.kind === "shortcut") return trick.tier === "verified" ? "Verified shortcut" : "Quick trick";
  if (trick.kind === "memory_cue") return "Memory cue";
  return trick.tier === "verified" ? "Verified rule" : "Rule of thumb";
}

export function trickById(id: string): VerifiedTrick | null {
  return VERIFIED_TRICKS.find((trick) => trick.id === id) ?? null;
}
