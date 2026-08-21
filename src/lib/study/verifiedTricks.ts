/**
 * App-facing Verified Learning Tricks Library.
 *
 * The library and its retrieval rules live with the Edge function shared code
 * so the generator and the Study/Assignment Help UI can never disagree about
 * what counts as a trustworthy trick.
 *
 * Cost contract: this lookup is pure code. Checking the library NEVER issues a
 * model call, a network request, or a database read. Only when it returns
 * nothing does the caller fall through to the quality-gated AI path.
 */

export {
  VERIFIED_TRICKS,
  OMITTED_EXAMPLES,
  selectVerifiedTrick,
  selectVerifiedTricks,
  trickById,
  trickCardLabel,
} from "../../../supabase/functions/_shared/verified-tricks";

export type {
  TrickDomain,
  TrickKind,
  TrickMatch,
  TrickQuery,
  TrickSelectOptions,
  TrickSourceType,
  TrickTier,
  TrickTransferCheck,
  VerifiedTrick,
} from "../../../supabase/functions/_shared/verified-tricks";

import type { StrategyEvidence } from "./strategyEvidence";
import { STRATEGY_BY_ID } from "./strategyToolbox";

/**
 * Turns the student's own observed effectiveness into a technique ordering.
 * This is a preference signal, never a learner-type label: it only breaks ties
 * between tricks that are already applicable, it is scoped to subject + task,
 * and it reverses as soon as the evidence does.
 */
export function preferredTechniquesFromEvidence(
  evidence: readonly StrategyEvidence[],
): string[] {
  return evidence
    .filter((entry) => entry.meaningful && entry.lift > 0 && !!entry.strategyId)
    .sort((a, b) => b.lift - a.lift)
    .map((entry) => STRATEGY_BY_ID[entry.strategyId as string]?.technique)
    .filter((technique): technique is string => !!technique)
    .filter((technique, index, all) => all.indexOf(technique) === index);
}
