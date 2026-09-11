import { isTeachableAnswer, isStudentConfusionLine, isCaptureMetadataLine } from "./teachable-content.ts";

/** Extract complete source clauses, never truncate an answer mid-thought. */
export function shortStudyAnswer(name: string, source: string, maxWords: number): string {
  const text = source.trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namesConcept = new RegExp(`\\b${escaped}\\b`, "i");
  const label = new RegExp(`^${escaped}\\s*[:–—]\\s*`, "i");
  const clauses = text.split(/\r?\n|[•·▪]|(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim()).filter(Boolean);
  const safe = (part: string, labeled = false) => part.split(/\s+/).length <= maxWords
    && !/\b(?:due|quiz|exam|assignment|syllabus|copyright)\b/i.test(part)
    && !isStudentConfusionLine(part) && !isCaptureMetadataLine(part)
    && !/^(?:please\s+)?(?:review|study|learn|remember|help|explain)\b/i.test(part)
    && isTeachableAnswer(labeled ? `${name} means ${part}` : part);
  // A named clause prevents choosing another concept from a shared OCR chunk.
  for (const clause of clauses.filter((part) => namesConcept.test(part))) {
    const answer = clause.replace(label, "");
    if (safe(answer, label.test(clause))) return answer;
    // Slides often omit sentence punctuation: retain an explicit relationship,
    // such as "Spacing effect beats massed practice", without inventing a definition.
    if (/\b(?:beats|improves|strengthens|stores|retrieves|encodes)\b/i.test(clause)
      && safe(`${answer}.`)) return answer;
  }
  // An already isolated definition need not repeat its term. Never choose an
  // arbitrary short line out of a multi-topic slide.
  if (clauses.length === 1 && safe(text)) return text.replace(label, "");
  return "";
}
