import type { ReadinessExplanation } from "./readinessExplanation";

export interface ClassTruthInput {
  captureCount: number;
  conceptCount: number;
  attempts: number;
  explanation: ReadinessExplanation;
}

export interface ClassTruth {
  materialLabel: string;
  preparednessLabel: string;
  nextAction: string;
}

export function deriveClassTruth({ captureCount, conceptCount, attempts, explanation }: ClassTruthInput): ClassTruth {
  const hasMaterial = captureCount > 0 || conceptCount > 0;
  const materialLabel = !hasMaterial
    ? "Need material"
    : captureCount >= 3 || conceptCount >= 5
      ? "Good material"
      : "Some material";

  const preparednessLabel = attempts === 0
    ? "Not practiced"
    : explanation.status === "scored" && explanation.percent !== null
      ? `${explanation.label} · ${explanation.percent}%`
      : explanation.label;

  const nextAction = !hasMaterial
    ? "Add material"
    : attempts === 0
      ? "Start practice"
      : explanation.weakCount > 0
        ? "Practice weak spots"
        : "Quick review";

  return { materialLabel, preparednessLabel, nextAction };
}
