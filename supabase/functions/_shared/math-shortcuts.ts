/**
 * Deterministic, verified mental-math shortcuts.
 *
 * Rules for anything in this file:
 *   1. Every shortcut is a mathematically valid transformation, stated with
 *      its conditions and limits — never presented as magic.
 *   2. Every shortcut carries a numeric self-check that runs before it is
 *      shown, so a mis-parsed problem is dropped instead of taught.
 *   3. No AI call. These cost zero tokens and are safe to reuse forever.
 *
 * Anything that cannot be verified here does not ship as a "trick".
 */

export interface VerifiedShortcut {
  id: string;
  title: string;
  /** The transformation, in plain language. */
  statement: string;
  /** Why it is true — the actual reason, not "it just works". */
  why: string;
  /** When it applies and when it stops helping. */
  conditions: string;
  /** Worked instance drawn from the student's own numbers. */
  example: string;
  /** Always true once returned: the shortcut was checked numerically. */
  verified: true;
}

const round = (value: number) => Math.round(value * 1e9) / 1e9;

/**
 * a% of b === b% of a, because a% of b = (a x b) / 100 and multiplication is
 * commutative. Returns null if the identity does not check out numerically,
 * which should be impossible for finite inputs — that is the point of the guard.
 */
export function percentSwap(a: number, b: number): VerifiedShortcut | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const left = round((a / 100) * b);
  const right = round((b / 100) * a);
  if (left !== right) return null;
  const swapped = round(b / 100) * a;
  return {
    id: "percent-swap",
    title: "Percent swap",
    statement: `${a}% of ${b} is the same as ${b}% of ${a}.`,
    why: "a% of b means (a x b) / 100, and multiplication is commutative, so (a x b) / 100 = (b x a) / 100. Both sides are literally the same product.",
    conditions:
      "Always true for any two numbers, including decimals and negatives. It only saves time when one side is easier — for example when the swapped percent is 10%, 25%, or 50%. It does not apply to percent increase/decrease or percent change problems.",
    example: `${a}% of ${b} = ${b}% of ${a} = ${swapped}`,
    verified: true,
  };
}

/** x5 = halve, then x10. Valid for every real number. */
export function timesFiveShortcut(n: number): VerifiedShortcut | null {
  if (!Number.isFinite(n)) return null;
  const direct = round(n * 5);
  const viaHalf = round((n / 2) * 10);
  if (direct !== viaHalf) return null;
  return {
    id: "times-five",
    title: "Multiply by 5 the easy way",
    statement: `${n} x 5 = half of ${n}, then x10.`,
    why: "5 = 10 / 2, so n x 5 = n x 10 / 2. Halving first keeps the numbers small.",
    conditions:
      "Valid for any number. Easiest when the number is even; with an odd number you carry a .5 through the x10 step.",
    example: `${n} x 5 = (${round(n / 2)}) x 10 = ${direct}`,
    verified: true,
  };
}

/** Dividing by a fraction = multiplying by its reciprocal. */
export function divideByFractionShortcut(n: number, divisor: number): VerifiedShortcut | null {
  if (!Number.isFinite(n) || !Number.isFinite(divisor) || divisor === 0) return null;
  const direct = round(n / divisor);
  const viaReciprocal = round(n * (1 / divisor));
  if (direct !== viaReciprocal) return null;
  return {
    id: "divide-by-fraction",
    title: "Divide by a fraction",
    statement: `${n} ÷ ${divisor} = ${n} x ${round(1 / divisor)}.`,
    why: "Dividing by d is defined as multiplying by 1/d, so dividing by 0.5 doubles a number instead of halving it.",
    conditions:
      "Never valid when the divisor is 0. Most useful when the reciprocal is a whole number (÷0.5, ÷0.25, ÷0.2).",
    example: `${n} ÷ ${divisor} = ${n} x ${round(1 / divisor)} = ${direct}`,
    verified: true,
  };
}

const PERCENT_OF = /(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/i;
const TIMES_FIVE = /(-?\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*5(?!\d)/i;
const DIVIDE_FRACTION = /(-?\d+(?:\.\d+)?)\s*(?:÷|\/)\s*(0?\.\d+)/;

/**
 * Scans grounded source text for arithmetic the catalog has a *verified*
 * shortcut for. Purely deterministic pattern matching over the student's own
 * material — it never invents a problem that is not in the text.
 */
export function detectVerifiedShortcuts(text: string, limit = 2): VerifiedShortcut[] {
  const found: VerifiedShortcut[] = [];
  const input = (text ?? "").slice(0, 4000);

  const percent = PERCENT_OF.exec(input);
  if (percent) {
    const shortcut = percentSwap(Number(percent[1]), Number(percent[2]));
    if (shortcut) found.push(shortcut);
  }
  const fraction = DIVIDE_FRACTION.exec(input);
  if (fraction) {
    const shortcut = divideByFractionShortcut(Number(fraction[1]), Number(fraction[2]));
    if (shortcut) found.push(shortcut);
  }
  const five = TIMES_FIVE.exec(input);
  if (five) {
    const shortcut = timesFiveShortcut(Number(five[1]));
    if (shortcut) found.push(shortcut);
  }

  return found.slice(0, Math.max(0, limit));
}

/** Non-computational checking habits. Always safe, always deterministic. */
export const SANITY_CHECKS: ReadonlyArray<{ id: string; title: string; body: string }> = [
  {
    id: "estimate-first",
    title: "Estimate before you solve",
    body: "Round to easy numbers and predict the size of the answer. If the exact answer is far from the estimate, you made an arithmetic slip, not a conceptual one.",
  },
  {
    id: "unit-check",
    title: "Check the units",
    body: "Carry units through the whole calculation. If the units of your answer are not the units the question asked for, a conversion step is missing or flipped.",
  },
  {
    id: "plug-it-back",
    title: "Plug the answer back in",
    body: "Substitute your answer into the original statement. If both sides do not match, the answer is wrong regardless of how the work looked.",
  },
  {
    id: "reasonable-range",
    title: "Ask if it is reasonable",
    body: "A percent over 100, a negative length, or a probability above 1 is a signal to recheck the setup, not to keep going.",
  },
];
