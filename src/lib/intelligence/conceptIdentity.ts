/**
 * App-facing mirror of the deterministic concept-identity layer. The rules
 * live with the Edge function shared code so the server and the UI can never
 * disagree about when two captures describe the same concept.
 */

export {
  conceptTokens,
  conceptCanonicalKey,
  isSameConcept,
  dedupeConceptCandidates,
} from "../../../supabase/functions/_shared/concept-identity";

export type {
  ConceptDedupeResult,
  DedupeCandidate,
  ExistingConcept,
} from "../../../supabase/functions/_shared/concept-identity";
