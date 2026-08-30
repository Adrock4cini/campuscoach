/**
 * Assignment Tutor v1.
 *
 * Builds a deliberately narrow tutoring loop for one grounded percent problem:
 * original attempt -> next-step hint -> different worked example -> transfer.
 * The builder is pure, deterministic, and uses decimal-safe integer arithmetic;
 * it never calls a model and never invents facts outside the supported pattern.
 */

export type AssignmentTutorProblemKind = "percent-of" | "percent-discount";

export interface AssignmentTutorInput {
  conceptId: string;
  conceptName: string;
  /** The exact server-selected excerpt. It is preserved byte-for-byte. */
  sourceExcerpt: string;
}

export interface GradedTutorProblem {
  prompt: string;
  choices: string[];
  answerIndex: number;
  rationale: string;
}

export interface AssignmentTutorPractice {
  id: string;
  conceptId: string;
  conceptName: string;
  sourceExcerpt: string;
  routeKind: "solve-problems";
  original: GradedTutorProblem;
  /** A next-step cue. It intentionally contains no digits or computed value. */
  hint: string;
  walkthrough: {
    prompt: string;
    steps: string[];
    answer: string;
  };
  transfer: GradedTutorProblem;
}

export type AssignmentTutorBuildResult =
  | { supported: true; problem: AssignmentTutorPractice }
  | { supported: false; reason: "unsupported_assignment_problem" };

export interface AssignmentTutorExtractedSource {
  summary: string;
  concepts: Array<{
    name: string;
    definition: string;
    examples: string[];
    professor_emphasis: boolean;
  }>;
}

interface Decimal {
  units: bigint;
  scale: number;
}

interface PercentOfProblem {
  kind: "percent-of";
  percent: Decimal;
  whole: Decimal;
  currency: boolean;
}

interface PercentDiscountProblem {
  kind: "percent-discount";
  percent: Decimal;
  price: Decimal;
  label: string;
}

type ParsedProblem = PercentOfProblem | PercentDiscountProblem;

interface ParsedProblemMatch {
  index: number;
  end: number;
  problem: ParsedProblem;
}

const MAX_ASSIGNMENT_TUTOR_SOURCE_CHARS = 360;
const NUMBER_SOURCE = "\\d{1,12}(?:\\.\\d{1,4})?";
const ITEM_LABEL_SOURCE = "[a-z][a-z-]{2,20}";
const SHORTHAND_ITEM_SOURCE = "(?:item|jacket|backpack|headphones|book|textbook|game|sweater|shirt|shoes|bike|laptop|phone|bag|coat|dress|table|desk|chair|ticket)";
const PERCENT_PREFIX = "(?:(?:please\\s+)?(?:what\\s+is|find|calculate|compute|determine|solve)|teacher\\s+example)";
const PERCENT_OF = new RegExp(
  `^\\s*(?:${PERCENT_PREFIX}\\s*:?\\s*)?(${NUMBER_SOURCE})\\s*(?:%|percent)\\s+of\\s*(\\$\\s*)?(${NUMBER_SOURCE})\\s*(?:=\\s*\\?)?\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_PRICE_BARE = new RegExp(
  `^\\s*\\$\\s*(${NUMBER_SOURCE})\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_PRICE_SHORTHAND = new RegExp(
  `^\\s*\\$\\s*(${NUMBER_SOURCE})\\s+(${SHORTHAND_ITEM_SOURCE})\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_PRICE_GRAMMATICAL = new RegExp(
  `^\\s*(?:a|an)?\\s*\\$\\s*(${NUMBER_SOURCE})\\s+(${ITEM_LABEL_SOURCE})\\s+(?:is|at)\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_PERCENT_BARE = new RegExp(
  `^\\s*(?:the\\s+sale\\s+is\\s+)?(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s+\\$\\s*(${NUMBER_SOURCE})\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_PERCENT_SHORTHAND = new RegExp(
  `^\\s*(?:the\\s+sale\\s+is\\s+)?(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s+(?:(?:a|an|the)\\s+)?\\$\\s*(${NUMBER_SOURCE})\\s+(${SHORTHAND_ITEM_SOURCE})\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_FULL_QUESTION = new RegExp(
  `^\\s*(?:a|an)\\s+\\$\\s*(${NUMBER_SOURCE})\\s+(${ITEM_LABEL_SOURCE})\\s+is\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[.]?\\s*what\\s+is\\s+the\\s+sale\\s+price\\s*\\?\\s*$`,
  "i",
);
const DISCOUNT_LABEL_COSTS = new RegExp(
  `^\\s*(?:a|an)\\s+(${ITEM_LABEL_SOURCE})\\s+costs\\s+\\$\\s*(${NUMBER_SOURCE})\\s+and\\s+is\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_FIND_SALE = new RegExp(
  `^\\s*(?:find|calculate)\\s+the\\s+sale\\s+price\\s+of\\s+(?:a|an)\\s+\\$\\s*(${NUMBER_SOURCE})\\s+(${ITEM_LABEL_SOURCE})\\s+(?:that\\s+)?is\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
const DISCOUNT_CALCULATE_COLON = new RegExp(
  `^\\s*calculate\\s+the\\s+sale\\s+price\\s*:\\s*\\$\\s*(${NUMBER_SOURCE})\\s+(${ITEM_LABEL_SOURCE})\\s+(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[?!.]?\\s*$`,
  "i",
);
// The learner-facing copy advertises the ordinary two-sentence textbook form
// ("A jacket costs $80. It is 25% off. What is the sale price?"). Parse it
// deterministically rather than leaving the advertised case unsupported.
const DISCOUNT_COSTS_SENTENCES = new RegExp(
  `^\\s*(?:a|an|the)\\s+(${ITEM_LABEL_SOURCE})\\s+costs\\s+\\$\\s*(${NUMBER_SOURCE})\\s*[.,;]?\\s*`
  + `(?:it|the\\s+\\1)\\s+is\\s+(?:on\\s+sale\\s+(?:for|at)\\s+)?(${NUMBER_SOURCE})\\s*(?:%|percent)\\s*off\\s*[.,;!?]?\\s*`
  + `(?:(?:what|find|calculate|compute|determine)\\s+(?:is\\s+)?the\\s+sale\\s+price\\s*[?.!]?\\s*)?$`,
  "i",
);


function decimal(raw: string): Decimal {
  const [integerPart, fractionPart = ""] = raw.split(".");
  return normalizeDecimal({
    units: BigInt(`${integerPart}${fractionPart}`),
    scale: fractionPart.length,
  });
}

function normalizeDecimal(value: Decimal): Decimal {
  let { units, scale } = value;
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return { units, scale };
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function alignDecimals(left: Decimal, right: Decimal): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.units * powerOfTen(scale - left.scale),
    right.units * powerOfTen(scale - right.scale),
    scale,
  ];
}

function addDecimals(left: Decimal, right: Decimal): Decimal {
  const [leftUnits, rightUnits, scale] = alignDecimals(left, right);
  return normalizeDecimal({ units: leftUnits + rightUnits, scale });
}

function subtractDecimals(left: Decimal, right: Decimal): Decimal {
  const [leftUnits, rightUnits, scale] = alignDecimals(left, right);
  return normalizeDecimal({ units: leftUnits - rightUnits, scale });
}

function multiplyDecimals(left: Decimal, right: Decimal): Decimal {
  return normalizeDecimal({ units: left.units * right.units, scale: left.scale + right.scale });
}

function divideByHundred(value: Decimal): Decimal {
  return normalizeDecimal({ units: value.units, scale: value.scale + 2 });
}

function multiplyByInteger(value: Decimal, multiplier: bigint): Decimal {
  return normalizeDecimal({ units: value.units * multiplier, scale: value.scale });
}

function divideByTen(value: Decimal): Decimal {
  return normalizeDecimal({ units: value.units, scale: value.scale + 1 });
}

function compareDecimals(left: Decimal, right: Decimal): number {
  const [leftUnits, rightUnits] = alignDecimals(left, right);
  return leftUnits === rightUnits ? 0 : leftUnits < rightUnits ? -1 : 1;
}

function sameDecimal(left: Decimal, right: Decimal): boolean {
  return compareDecimals(left, right) === 0;
}

function formatDecimal(value: Decimal): string {
  const normalized = normalizeDecimal(value);
  const negative = normalized.units < 0n;
  const digits = (negative ? -normalized.units : normalized.units).toString();
  if (normalized.scale === 0) return `${negative ? "-" : ""}${digits}`;

  const padded = digits.padStart(normalized.scale + 1, "0");
  const split = padded.length - normalized.scale;
  return `${negative ? "-" : ""}${padded.slice(0, split)}.${padded.slice(split)}`;
}

/** Currency is rounded half-up to cents using integers, never binary floats. */
function formatMoney(value: Decimal): string {
  const rounded = roundMoney(value);
  const negative = rounded.units < 0n;
  const absoluteUnits = negative ? -rounded.units : rounded.units;
  const cents = rounded.scale === 2
    ? absoluteUnits
    : absoluteUnits * powerOfTen(2 - rounded.scale);
  const dollars = cents / 100n;
  const centPart = cents % 100n;
  const display = centPart === 0n
    ? dollars.toString()
    : `${dollars}.${centPart.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}$${display}`;
}

/** Retail discounts round the discount amount to cents before subtraction. */
function roundMoney(value: Decimal): Decimal {
  const negative = value.units < 0n;
  const absoluteUnits = negative ? -value.units : value.units;
  let cents: bigint;

  if (value.scale <= 2) {
    cents = absoluteUnits * powerOfTen(2 - value.scale);
  } else {
    const divisor = powerOfTen(value.scale - 2);
    const remainder = absoluteUnits % divisor;
    cents = absoluteUnits / divisor;
    if (remainder * 2n >= divisor) cents += 1n;
  }

  return normalizeDecimal({ units: negative ? -cents : cents, scale: 2 });
}

function percentageOf(percent: Decimal, whole: Decimal): Decimal {
  return divideByHundred(multiplyDecimals(percent, whole));
}

function canonicalLabel(raw: string | undefined): string | null {
  const label = raw?.trim().toLowerCase();
  if (!label) return "item";
  if (label.endsWith("ly")
    || /^(?:about|almost|approximately|around|estimated|less|maybe|minus|more|nearly|never|not|over|perhaps|plus|possibly|probably|roughly|under|and|at|costs?|is|now|off|percent|priced?|sale|total|was|with)$/.test(label)) return null;
  return label;
}

function parseProblems(sourceExcerpt: string): ParsedProblemMatch[] {
  // A worksheet often prefixes an otherwise exact problem with an item
  // number. Ignore one numeric label for parsing while preserving the
  // student-confirmed sourceExcerpt byte-for-byte in the saved artifact.
  sourceExcerpt = sourceExcerpt.replace(/^\s*\d{1,4}\s*[.)]\s*/, "");
  const found: ParsedProblemMatch[] = [];

  const percentOf = sourceExcerpt.match(PERCENT_OF);
  if (percentOf) {
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-of",
        percent: decimal(percentOf[1]),
        whole: decimal(percentOf[3]),
        currency: Boolean(percentOf[2]),
      },
    });
  }

  const priceBare = sourceExcerpt.match(DISCOUNT_PRICE_BARE);
  if (priceBare) {
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-discount",
        price: decimal(priceBare[1]),
        percent: decimal(priceBare[2]),
        label: "item",
      },
    });
  }

  const priceLabeled = sourceExcerpt.match(DISCOUNT_PRICE_SHORTHAND)
    ?? sourceExcerpt.match(DISCOUNT_PRICE_GRAMMATICAL);
  if (priceLabeled) {
    const label = canonicalLabel(priceLabeled[2]);
    if (!label) return found;
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-discount",
        price: decimal(priceLabeled[1]),
        percent: decimal(priceLabeled[3]),
        label,
      },
    });
  }

  const percentBare = sourceExcerpt.match(DISCOUNT_PERCENT_BARE);
  if (percentBare) {
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-discount",
        percent: decimal(percentBare[1]),
        price: decimal(percentBare[2]),
        label: "item",
      },
    });
  }

  const percentLabeled = sourceExcerpt.match(DISCOUNT_PERCENT_SHORTHAND);
  if (percentLabeled) {
    const label = canonicalLabel(percentLabeled[3]);
    if (!label) return found;
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-discount",
        percent: decimal(percentLabeled[1]),
        price: decimal(percentLabeled[2]),
        label,
      },
    });
  }

  const wrappedDiscounts: Array<{
    match: RegExpMatchArray | null;
    priceIndex: number;
    labelIndex: number;
    percentIndex: number;
  }> = [
    { match: sourceExcerpt.match(DISCOUNT_FULL_QUESTION), priceIndex: 1, labelIndex: 2, percentIndex: 3 },
    { match: sourceExcerpt.match(DISCOUNT_LABEL_COSTS), priceIndex: 2, labelIndex: 1, percentIndex: 3 },
    { match: sourceExcerpt.match(DISCOUNT_FIND_SALE), priceIndex: 1, labelIndex: 2, percentIndex: 3 },
    { match: sourceExcerpt.match(DISCOUNT_CALCULATE_COLON), priceIndex: 1, labelIndex: 2, percentIndex: 3 },
    { match: sourceExcerpt.match(DISCOUNT_COSTS_SENTENCES), priceIndex: 2, labelIndex: 1, percentIndex: 3 },

  ];
  for (const wrapper of wrappedDiscounts) {
    if (!wrapper.match) continue;
    const label = canonicalLabel(wrapper.match[wrapper.labelIndex]);
    if (!label) continue;
    found.push({
      index: 0,
      end: sourceExcerpt.length,
      problem: {
        kind: "percent-discount",
        price: decimal(wrapper.match[wrapper.priceIndex]),
        percent: decimal(wrapper.match[wrapper.percentIndex]),
        label,
      },
    });
  }

  return found.sort((left, right) => left.index - right.index);
}

function validProblem(problem: ParsedProblem): boolean {
  const zero = decimal("0");
  if (problem.kind === "percent-of") {
    return compareDecimals(problem.percent, zero) >= 0
      && compareDecimals(problem.whole, zero) >= 0
      && (!problem.currency || problem.whole.scale <= 2);
  }
  const hundred = decimal("100");
  return compareDecimals(problem.price, zero) >= 0
    && problem.price.scale <= 2
    && compareDecimals(problem.percent, zero) >= 0
    && compareDecimals(problem.percent, hundred) <= 0;
}

function fourChoices(
  answerValue: Decimal,
  candidates: Decimal[],
  formatter: (value: Decimal) => string,
  seed: string,
): { choices: string[]; answerIndex: number } {
  const answer = formatter(answerValue);
  const distractors: string[] = [];
  const seen = new Set([answer]);

  const addCandidate = (candidate: Decimal) => {
    const rendered = formatter(candidate);
    if (seen.has(rendered)) return;
    seen.add(rendered);
    distractors.push(rendered);
  };

  candidates.forEach(addCandidate);
  for (const increment of ["1", "2", "5", "10", "20"]) {
    if (distractors.length >= 3) break;
    addCandidate(addDecimals(answerValue, decimal(increment)));
  }

  const choices = distractors.slice(0, 3);
  // Keep answer placement deterministic for reproducible artifacts without
  // teaching students that the third option is always correct.
  const answerIndex = stableHash32(seed) % 4;
  choices.splice(answerIndex, 0, answer);
  return { choices, answerIndex };
}

function stableHash32(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectStablePair<T>(candidates: T[], seed: string): [T, T] | null {
  if (candidates.length < 2) return null;
  const walkthroughIndex = stableHash32(`${seed}:walkthrough`) % candidates.length;
  let transferIndex = stableHash32(`${seed}:transfer`) % (candidates.length - 1);
  if (transferIndex >= walkthroughIndex) transferIndex += 1;
  return [candidates[walkthroughIndex], candidates[transferIndex]];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPercentOfGraded(problem: PercentOfProblem): GradedTutorProblem {
  const result = percentageOf(problem.percent, problem.whole);
  const formatter = problem.currency ? formatMoney : formatDecimal;
  const percent = formatDecimal(problem.percent);
  const whole = formatter(problem.whole);
  const answer = formatter(result);
  const decimalPercent = formatDecimal(divideByHundred(problem.percent));
  const { choices, answerIndex } = fourChoices(result, [
    multiplyDecimals(problem.percent, problem.whole),
    subtractDecimals(problem.whole, result),
    multiplyByInteger(result, 10n),
    divideByTen(result),
  ], formatter, `percent-of:${percent}:${whole}`);

  return {
    prompt: `What is ${percent}% of ${whole}?`,
    choices,
    answerIndex,
    rationale: `${percent}% means ${percent} ÷ 100 = ${decimalPercent}, and ${decimalPercent} × ${whole} = ${answer}.`,
  };
}

function buildDiscountGraded(problem: PercentDiscountProblem): GradedTutorProblem {
  const discount = roundMoney(percentageOf(problem.percent, problem.price));
  const sale = discountSale(problem);
  const percent = formatDecimal(problem.percent);
  const price = formatMoney(problem.price);
  const discountDisplay = formatMoney(discount);
  const answer = formatMoney(sale);
  const { choices, answerIndex } = fourChoices(sale, [
    discount,
    problem.price,
    addDecimals(problem.price, discount),
    multiplyByInteger(sale, 10n),
  ], formatMoney, `discount:${percent}:${price}:${problem.label}`);

  return {
    prompt: `A ${price} ${problem.label} is ${percent}% off. What is the sale price?`,
    choices,
    answerIndex,
    rationale: `${percent}% of ${price} is ${discountDisplay}, so the sale price is ${price} − ${discountDisplay} = ${answer}.`,
  };
}

function discountSale(problem: PercentDiscountProblem): Decimal {
  return subtractDecimals(
    problem.price,
    roundMoney(percentageOf(problem.percent, problem.price)),
  );
}

interface PercentExample {
  percent: string;
  whole: string;
}

interface DiscountExample {
  percent: string;
  price: string;
  label: string;
}

const PERCENT_EXAMPLES: PercentExample[] = [
  { percent: "20", whole: "60" },
  { percent: "25", whole: "80" },
  { percent: "30", whole: "90" },
  { percent: "15", whole: "200" },
  { percent: "40", whole: "70" },
  { percent: "12", whole: "50" },
  { percent: "35", whole: "40" },
  { percent: "5", whole: "300" },
];

const DISCOUNT_EXAMPLES: DiscountExample[] = [
  { percent: "25", price: "40", label: "backpack" },
  { percent: "20", price: "75", label: "headphones" },
  { percent: "10", price: "90", label: "jacket" },
  { percent: "30", price: "50", label: "book" },
  { percent: "15", price: "120", label: "item" },
  { percent: "40", price: "45", label: "game" },
  { percent: "50", price: "64", label: "sweater" },
  { percent: "5", price: "200", label: "item" },
];

function selectPercentExamples(original: PercentOfProblem): [PercentOfProblem, PercentOfProblem] | null {
  const formatter = original.currency ? formatMoney : formatDecimal;
  const originalAnswer = formatter(percentageOf(original.percent, original.whole));
  const usable = uniqueBy(PERCENT_EXAMPLES.map(({ percent, whole }) => ({
    kind: "percent-of" as const,
    percent: decimal(percent),
    whole: decimal(whole),
    currency: original.currency,
  })).filter((candidate) =>
    !sameDecimal(candidate.percent, original.percent)
    && !sameDecimal(candidate.whole, original.whole)
    && formatter(percentageOf(candidate.percent, candidate.whole)) !== originalAnswer
  ), (candidate) => formatter(percentageOf(candidate.percent, candidate.whole)));
  const seed = [
    "percent-of:v1",
    formatDecimal(original.percent),
    formatDecimal(original.whole),
    original.currency ? "money" : "number",
  ].join(":");
  return selectStablePair(usable, seed);
}

function selectDiscountExamples(original: PercentDiscountProblem): [PercentDiscountProblem, PercentDiscountProblem] | null {
  const originalAnswer = formatMoney(discountSale(original));
  const usable = uniqueBy(DISCOUNT_EXAMPLES.map(({ percent, price, label }) => ({
    kind: "percent-discount" as const,
    percent: decimal(percent),
    price: decimal(price),
    label,
  })).filter((candidate) =>
    !sameDecimal(candidate.percent, original.percent)
    && !sameDecimal(candidate.price, original.price)
    && formatMoney(discountSale(candidate)) !== originalAnswer
  ), (candidate) => formatMoney(discountSale(candidate)));
  const seed = [
    "percent-discount:v1",
    formatDecimal(original.percent),
    formatDecimal(original.price),
  ].join(":");
  return selectStablePair(usable, seed);
}

function percentWalkthrough(problem: PercentOfProblem): AssignmentTutorPractice["walkthrough"] {
  const percent = formatDecimal(problem.percent);
  const formatter = problem.currency ? formatMoney : formatDecimal;
  const whole = formatter(problem.whole);
  const decimalPercent = formatDecimal(divideByHundred(problem.percent));
  const answer = formatter(percentageOf(problem.percent, problem.whole));
  return {
    prompt: `What is ${percent}% of ${whole}?`,
    steps: [
      `Convert the percent to a decimal: ${percent} ÷ 100 = ${decimalPercent}.`,
      `Multiply the decimal by the whole amount: ${decimalPercent} × ${whole} = ${answer}.`,
    ],
    answer,
  };
}

function discountWalkthrough(problem: PercentDiscountProblem): AssignmentTutorPractice["walkthrough"] {
  const percent = formatDecimal(problem.percent);
  const decimalPercent = formatDecimal(divideByHundred(problem.percent));
  const price = formatMoney(problem.price);
  const discount = roundMoney(percentageOf(problem.percent, problem.price));
  const discountDisplay = formatMoney(discount);
  const answer = formatMoney(subtractDecimals(problem.price, discount));
  return {
    prompt: `A ${price} ${problem.label} is ${percent}% off. What is the sale price?`,
    steps: [
      `Find the discount: ${percent}% = ${decimalPercent}, and ${decimalPercent} × ${price} = ${discountDisplay}.`,
      `Subtract the discount from the original price: ${price} − ${discountDisplay} = ${answer}.`,
    ],
    answer,
  };
}

/**
 * Builds one complete tutoring turn only when the excerpt contains exactly one
 * supported percent problem. All other inputs return a machine-readable
 * unsupported result so callers can use another tutor without guessing.
 */
export function buildAssignmentTutorPractice(input: AssignmentTutorInput): AssignmentTutorBuildResult {
  const conceptId = input.conceptId?.trim();
  const conceptName = input.conceptName?.trim();
  const sourceExcerpt = input.sourceExcerpt;
  if (!conceptId || conceptId.length > 200
    || !conceptName || conceptName.length > 200
    || typeof sourceExcerpt !== "string"
    || !sourceExcerpt.trim()
    || sourceExcerpt.length > MAX_ASSIGNMENT_TUTOR_SOURCE_CHARS) {
    return { supported: false, reason: "unsupported_assignment_problem" };
  }

  const parsed = parseProblems(sourceExcerpt);
  if (parsed.length !== 1 || !validProblem(parsed[0].problem)) {
    return { supported: false, reason: "unsupported_assignment_problem" };
  }

  const originalProblem = parsed[0].problem;
  let original: GradedTutorProblem;
  let hint: string;
  let walkthrough: AssignmentTutorPractice["walkthrough"];
  let transfer: GradedTutorProblem;

  if (originalProblem.kind === "percent-of") {
    const examples = selectPercentExamples(originalProblem);
    if (!examples) return { supported: false, reason: "unsupported_assignment_problem" };
    const [walkthroughProblem, transferProblem] = examples;
    original = buildPercentOfGraded(originalProblem);
    hint = "Convert the percent to a decimal, then multiply it by the whole amount.";
    walkthrough = percentWalkthrough(walkthroughProblem);
    transfer = buildPercentOfGraded(transferProblem);
  } else {
    const examples = selectDiscountExamples(originalProblem);
    if (!examples) return { supported: false, reason: "unsupported_assignment_problem" };
    const [walkthroughProblem, transferProblem] = examples;
    original = buildDiscountGraded(originalProblem);
    hint = "Find the discount amount first, then subtract it from the original price.";
    walkthrough = discountWalkthrough(walkthroughProblem);
    transfer = buildDiscountGraded(transferProblem);
  }

  return {
    supported: true,
    problem: {
      id: `practice-${conceptId}`,
      conceptId,
      conceptName,
      sourceExcerpt,
      routeKind: "solve-problems",
      original,
      hint,
      walkthrough,
      transfer,
    },
  };
}

/**
 * Exact concept extraction for the narrow problem families Tutor v1 owns.
 * This lets typed percent assignments become grounded concept memory without
 * a language-model extraction call or a second arithmetic implementation.
 */
export function extractAssignmentTutorSource(
  sourceExcerpt: string,
  professorEmphasis = false,
): AssignmentTutorExtractedSource | null {
  const built = buildAssignmentTutorPractice({
    conceptId: "deterministic-assignment-problem",
    conceptName: "Percent problem",
    sourceExcerpt,
  });
  if (!built.supported) return null;
  const discount = /sale price/i.test(built.problem.original.prompt);
  const name = discount ? "Percent Discount" : "Percent of a Number";
  return {
    summary: `The assignment contains one ${discount ? "percent discount" : "percent-of"} problem.`,
    concepts: [{
      name,
      definition: discount
        ? "Find the discount amount, then subtract it from the original price."
        : "Convert the percent to a decimal, then multiply it by the whole amount.",
      // Preserve the exact accepted source form so grounded-excerpt matching
      // can compare it with the capture without re-parsing generated prose.
      examples: [sourceExcerpt.trim()],
      professor_emphasis: professorEmphasis,
    }],
  };
}
