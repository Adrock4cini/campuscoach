/**
 * App-facing mirror of the Make It Stick quality gate. The gate itself lives
 * with the Edge function shared code so the server and the UI can never
 * disagree about what counts as a useful learning aid.
 */

export {
  NO_USEFUL_MNEMONIC_ERROR,
  TECHNIQUE_FAMILY,
  TECHNIQUE_DISPLAY_LABEL,
  techniqueFamily,
  techniqueDisplayLabel,
  evaluateMnemonicCandidate,
  selectBestMnemonicCandidate,
  candidateFromVerifiedShortcut,
  mnemonicFallbackSuggestion,
  nextTechniqueFamily,
} from "../../../supabase/functions/_shared/mnemonic-quality";

export type {
  MnemonicCandidate,
  MnemonicQualityContext,
  MnemonicQualityVerdict,
  MnemonicSelection,
  MnemonicTechniqueFamily,
} from "../../../supabase/functions/_shared/mnemonic-quality";

/** True when the generator declined to show a trick rather than force one. */
export function isNoUsefulTrickMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && /no useful memory trick/i.test(message);
}
