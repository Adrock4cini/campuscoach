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
