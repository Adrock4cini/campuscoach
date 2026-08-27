/**
 * Solvable-problem extraction.
 *
 * When the captured source already contains a real, checkable problem
 * ("14% of 50 = ?", "$80 jacket 25% off"), a generic prompt such as
 * "What do you remember about Percentages?" wastes the best retrieval
 * opportunity the student gave us. This module deterministically turns the
 * problem into a concrete question with a computed answer — no AI call and no
 * invented content.
 *
 * Deliberately narrow: only fully numeric, unambiguous patterns qualify.
 */

export interface SolvableProblem {
  /** Direct retrieval prompt, e.g. "What is 14% of 50?" */
  question: string;
  /** Exact computed answer, formatted for display. */
  answer: string;
  /** One-sentence worked explanation grounded in the captured numbers. */
  rationale: string;
  /** Plausible wrong answers from common student errors. */
  distractors: string[];
}

const NUM = "\\d+(?:\\.\\d+)?";

/** "14% of 50", "14 percent of 50", "What is 25% of $80?" */
const PERCENT_OF = new RegExp(`(${NUM})\\s*(?:%|percent)\\s*of\\s*\\$?(${NUM})`, "i");

/** "$80 jacket 25% off", "jacket costs $80, 25% off" */
const PERCENT_OFF = new RegExp(`\\$\\s*(${NUM})[^.\\n]{0,60}?(${NUM})\\s*(?:%|percent)\\s*off`, "i");
const PERCENT_OFF_REVERSED = new RegExp(`(${NUM})\\s*(?:%|percent)\\s*off[^.\\n]{0,60}?\\$\\s*(${NUM})`, "i");

function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function money(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

function uniqueDistractors(answer: string, candidates: string[]): string[] {
  const seen = new Set([answer]);
  const out: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

/** Item noun mentioned next to the price, so the prompt reads like the source. */
function itemLabel(source: string): string {
  const match = source.match(/\$\s*\d+(?:\.\d+)?\s+([a-z][a-z-]{2,20})/i);
  const word = match?.[1]?.toLowerCase();
  if (!word || /percent|off|dollars?|price|total/.test(word)) return "item";
  return word;
}

/**
 * Returns a concrete, checkable problem when the source contains one.
 * Returns null for ordinary prose so existing generators are untouched.
 */
export function extractSolvableProblem(rawText: string): SolvableProblem | null {
  const source = (rawText ?? "").trim();
  if (!source) return null;

  const off = source.match(PERCENT_OFF) ?? (() => {
    const reversed = source.match(PERCENT_OFF_REVERSED);
    return reversed ? ([reversed[0], reversed[2], reversed[1]] as unknown as RegExpMatchArray) : null;
  })();
  if (off) {
    const price = Number(off[1]);
    const percent = Number(off[2]);
    if (Number.isFinite(price) && Number.isFinite(percent) && percent <= 100) {
      const discount = (price * percent) / 100;
      const sale = price - discount;
      const label = itemLabel(source);
      return {
        question: `A ${money(price)} ${label} is ${fmt(percent)}% off. What is the sale price?`,
        answer: money(sale),
        rationale: `${fmt(percent)}% of ${money(price)} is ${money(discount)}, so the sale price is ${money(price)} − ${money(discount)} = ${money(sale)}.`,
        distractors: uniqueDistractors(money(sale), [
          money(discount),
          money(price),
          money(price + discount),
          money(price - discount / 2),
        ]),
      };
    }
  }

  const percentOf = source.match(PERCENT_OF);
  if (percentOf) {
    const percent = Number(percentOf[1]);
    const whole = Number(percentOf[2]);
    if (Number.isFinite(percent) && Number.isFinite(whole)) {
      const result = (percent * whole) / 100;
      return {
        question: `What is ${fmt(percent)}% of ${fmt(whole)}?`,
        answer: fmt(result),
        rationale: `${fmt(percent)}% means ${fmt(percent)} ÷ 100 = ${fmt(percent / 100)}, and ${fmt(percent / 100)} × ${fmt(whole)} = ${fmt(result)}.`,
        distractors: uniqueDistractors(fmt(result), [
          fmt(result * 10),
          fmt(percent * whole),
          fmt(whole - result),
          fmt(result / 10),
        ]),
      };
    }
  }

  return null;
}

/** Four-choice version of a solvable problem, or null when none applies. */
export function buildSolvableProblemChoices(rawText: string) {
  const problem = extractSolvableProblem(rawText);
  if (!problem) return null;
  const distractors = problem.distractors.slice(0, 3);
  if (distractors.length < 3) return null;
  const choices = [...distractors];
  const answerIndex = Math.min(2, choices.length);
  choices.splice(answerIndex, 0, problem.answer);
  return {
    prompt: problem.question,
    choices,
    answerIndex,
    rationale: problem.rationale,
  };
}
