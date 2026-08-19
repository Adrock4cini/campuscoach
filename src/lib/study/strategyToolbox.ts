/**
 * App-facing Personal Learning Toolbox.
 *
 * The catalog and the verified shortcut engine live with the Edge function
 * shared code so the generator prompts and the Study UI can never disagree
 * about what a strategy is or when it is safe to use.
 */

export {
  STRATEGY_CATALOG,
  STRATEGY_BY_ID,
  FALLBACK_STRATEGY_ID,
  selectStrategies,
  selectStrategy,
  contextualStudentActions,
  strategyPromptGuidance,
  isDeterministicStrategy,
  strategyIdForTechnique,
} from "../../../supabase/functions/_shared/strategy-catalog";

export type {
  Strategy,
  StrategyChoice,
  StrategyCost,
  StrategyModality,
  StrategyObservations,
  StrategySelectionContext,
  StudentAction,
  StudyTaskKind,
} from "../../../supabase/functions/_shared/strategy-catalog";

export {
  SANITY_CHECKS,
  detectVerifiedShortcuts,
  divideByFractionShortcut,
  percentSwap,
  timesFiveShortcut,
} from "../../../supabase/functions/_shared/math-shortcuts";

export type { VerifiedShortcut } from "../../../supabase/functions/_shared/math-shortcuts";

/** Browser read-aloud, using only built-in speech synthesis. No paid audio. */
export function canReadAloud(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function readAloud(text: string): boolean {
  if (!canReadAloud()) return false;
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!trimmed) return false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(trimmed));
  return true;
}

export function stopReadAloud(): void {
  if (canReadAloud()) window.speechSynthesis.cancel();
}
