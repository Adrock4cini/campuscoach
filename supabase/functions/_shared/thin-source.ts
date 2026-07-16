export interface ExactThinConcept {
  name: string;
  definition: string;
  examples: string[];
  professor_emphasis: boolean;
}

export interface ExactThinSource {
  summary: string;
  concepts: ExactThinConcept[];
  question: string;
  answer: string;
  sourceExcerpt: string;
}

export interface ExactThinMultipleChoice {
  prompt: string;
  choices: string[];
  answerIndex: number;
  rationale: string;
}

const NUMBER = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const SIMPLE_EQUATION = new RegExp(
  `^\\s*(${NUMBER})\\s*([+\\-xX×*÷/])\\s*(${NUMBER})\\s*=\\s*(${NUMBER})\\s*[.!]?\\s*$`,
);

const displayOperator = (operator: string) => {
  if (operator === "x" || operator === "X" || operator === "*") return "×";
  if (operator === "/") return "÷";
  return operator;
};

/**
 * Preserve a single arithmetic fact exactly instead of asking a language
 * model to inflate it into several vague concepts. This is deliberately
 * narrow: only fully numeric equations qualify.
 */
export function extractExactThinSource(
  rawText: string,
  professorEmphasis = false,
): ExactThinSource | null {
  const sourceExcerpt = rawText.trim();
  const match = sourceExcerpt.match(SIMPLE_EQUATION);
  if (!match) return null;

  const [, left, rawOperator, right, result] = match;
  const operator = displayOperator(rawOperator);
  const expression = `${left} ${operator} ${right}`;
  const equation = `${expression} = ${result}`;
  const definition = `${expression} equals ${result}.`;

  return {
    summary: `The note records the arithmetic fact ${equation}.`,
    concepts: [{
      name: equation,
      definition,
      examples: [equation],
      professor_emphasis: professorEmphasis,
    }],
    question: `What is ${expression}?`,
    answer: result,
    sourceExcerpt,
  };
}

/**
 * A thin arithmetic note should produce a direct test of the exact fact the
 * student captured. Keeping this deterministic prevents a model from turning
 * "2 + 2 = 4" into vague terminology or an unrelated transfer question.
 */
export function buildExactThinMultipleChoice(rawText: string): ExactThinMultipleChoice | null {
  const exact = extractExactThinSource(rawText);
  const match = rawText.trim().match(SIMPLE_EQUATION);
  if (!exact || !match) return null;

  const left = Number(match[1]);
  const right = Number(match[3]);
  const result = Number(match[4]);
  const step = Math.max(1, Math.abs(left), Math.abs(right));
  const candidates = [
    result - step,
    result - Math.max(1, Math.abs(left - right)),
    result,
    result + Math.max(1, Math.min(Math.abs(left) || 1, Math.abs(right) || 1)),
    result + step,
  ];
  const choices = [...new Set(candidates)]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .slice(0, 4);

  for (let offset = 1; choices.length < 4; offset += 1) {
    const candidate = result + step + offset;
    if (!choices.includes(candidate)) choices.push(candidate);
  }
  choices.sort((a, b) => a - b);

  return {
    prompt: exact.question,
    choices: choices.map(String),
    answerIndex: choices.indexOf(result),
    rationale: `${exact.sourceExcerpt.replace(/\s+/g, " ").replace(/[.!]?$/, ".")}`,
  };
}
