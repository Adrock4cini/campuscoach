/**
 * Make It Stick quality gate.
 *
 * Generative models happily produce clever-sounding but useless memory
 * tricks. This module is the deterministic judge that runs AFTER generation
 * and BEFORE anything reaches a student. It never authors content; it only
 * accepts, ranks, or rejects candidates.
 *
 * Four gates, in order:
 *   1. SOURCE TRUTH  — the target must be grounded and explanatory.
 *   2. VALIDITY      — no unverified etymology, no unconditioned shortcut,
 *                      no acronym that does not map to a real list.
 *   3. USEFULNESS    — short, distinct, non-circular, not harder than the
 *                      fact itself, not a generic "just remember it".
 *   4. FIT           — subject profile + task kind rank the survivors.
 *
 * If nothing clears the gate the caller must show no memory trick and offer
 * practice instead. An empty Make It Stick is a correct answer.
 */

import { isNonExplanatoryFragment } from "./grounding-quality.ts";
import { getSubjectProfile, type SubjectProfileId } from "./subject-profiles.ts";
import type { VerifiedShortcut } from "./math-shortcuts.ts";

export const NO_USEFUL_MNEMONIC_ERROR = "no-useful-memory-trick";

export type MnemonicTechniqueFamily =
  | "acronymic"
  | "association"
  | "visual"
  | "story"
  | "chunking"
  | "contrast"
  | "spatial"
  | "pattern"
  | "sound"
  | "other";

/** Technique -> family. "Try another way" must switch FAMILY, not reword. */
export const TECHNIQUE_FAMILY: Record<string, MnemonicTechniqueFamily> = {
  acronym: "acronymic",
  acrostic: "acronymic",
  first_letter_sentence: "acronymic",
  word_roots: "association",
  sound_alike: "sound",
  rhyme: "sound",
  familiar_bridge: "association",
  association: "association",
  visual: "visual",
  story: "story",
  chunking: "chunking",
  body_map: "spatial",
  compare_contrast: "contrast",
  number_shape: "pattern",
  worked_example: "pattern",
  other: "other",
};

/**
 * Truthful display labels. A vivid image is not a "memory trick", and a
 * proven math identity is not an AI invention — say which one it is.
 */
export const TECHNIQUE_DISPLAY_LABEL: Record<string, string> = {
  acronym: "Memory trick",
  acrostic: "Memory trick",
  first_letter_sentence: "Memory trick",
  word_roots: "Word roots",
  sound_alike: "Sound-alike hook",
  rhyme: "Memory trick",
  familiar_bridge: "Compare these",
  association: "Memory hook",
  visual: "Visual memory",
  story: "Story order",
  chunking: "Chunk it",
  body_map: "Location memory",
  compare_contrast: "Compare these",
  number_shape: "Pattern",
  worked_example: "Worked example",
  other: "Memory cue",
};

export function techniqueFamily(technique: string): MnemonicTechniqueFamily {
  return TECHNIQUE_FAMILY[technique] ?? "other";
}

export function techniqueDisplayLabel(technique: string, verified = false): string {
  if (verified) return "Verified shortcut";
  return TECHNIQUE_DISPLAY_LABEL[technique] ?? "Memory cue";
}

export interface MnemonicCandidate {
  mnemonic: string;
  technique: string;
  explanation: string;
  /** True only for deterministic, self-checked content (verified shortcuts). */
  verified?: boolean;
}

export interface MnemonicQualityContext {
  /** The exact grounded fact the trick must cue. */
  target: string;
  conceptName: string;
  sourceExcerpt?: string | null;
  subjectProfileId?: SubjectProfileId | string | null;
  taskKind?: string | null;
  /** Technique families the student already rejected or already saw. */
  rejectFamilies?: string[];
  /** Individual techniques to de-prioritise (feedback layer). */
  avoidTechniques?: string[];
}

export interface MnemonicQualityVerdict {
  accepted: boolean;
  score: number;
  /** Hard failures. Non-empty means the candidate must never be shown. */
  rejections: string[];
  reasons: string[];
  family: MnemonicTechniqueFamily;
  displayLabel: string;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "in", "into", "is", "it", "its", "of", "on", "or", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "to", "was",
  "were", "what", "when", "which", "will", "with", "you", "your",
]);

const ETYMOLOGY_CLAIM =
  /\b(comes from|derives? from|derived from|from the (?:latin|greek|french|german|spanish|arabic)|latin|greek|root word|word root|literally means|etymolog)/i;

const CONDITION_SIGNAL =
  /\b(works? (?:for|when|whenever)|holds? (?:for|when)|only when|as long as|any two numbers|valid when|does not work|doesn't work|not for|because|commutative|conditions?)\b/i;

const GENERIC_FILLER =
  /^(?:just\s+)?(?:remember|memorize|memorise|study|review|keep in mind|don't forget)\b/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'’\s-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function contentWords(text: string): string[] {
  return words(text).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function normalize(text: string): string {
  return words(text).join(" ");
}

/** Items a first-letter technique could legitimately encode. */
function listItems(target: string): string[] {
  return target
    .split(/[,;:•]|\band\b|\bthen\b|\d\s*[).]/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function acronymTokens(text: string): string[] {
  return (text.match(/\b[A-Z][A-Z]{1,7}\b/g) ?? []).filter((token) => token !== "I");
}

/**
 * Runs every gate on one candidate. Pure and deterministic: the same
 * candidate always gets the same verdict, so accepted results are cacheable
 * by grounded target + technique.
 */
export function evaluateMnemonicCandidate(
  candidate: MnemonicCandidate,
  context: MnemonicQualityContext,
): MnemonicQualityVerdict {
  const rejections: string[] = [];
  const reasons: string[] = [];
  const family = techniqueFamily(candidate.technique);
  const mnemonic = (candidate.mnemonic ?? "").trim();
  const explanation = (candidate.explanation ?? "").trim();
  const target = (context.target ?? "").trim();
  const verified = candidate.verified === true;

  /* ---------------------- 1. Source truth gate ---------------------- */
  if (!target) rejections.push("insufficient-source");
  else if (isNonExplanatoryFragment(target)) rejections.push("insufficient-source");
  if (!verified && !(context.sourceExcerpt ?? "").trim()) rejections.push("insufficient-source");
  if (contentWords(target).length < 2 && !verified) rejections.push("insufficient-source");

  /* ------------------------ 2. Validity gate ------------------------ */
  if (!verified) {
    const claimsEtymology =
      candidate.technique === "word_roots" || ETYMOLOGY_CLAIM.test(`${mnemonic} ${explanation}`);
    if (claimsEtymology) {
      const source = `${context.sourceExcerpt ?? ""} ${target}`;
      const supported = ETYMOLOGY_CLAIM.test(source);
      if (!supported) rejections.push("unverified-etymology");
    }

    const looksQuantitative = /[=×x*/+%]|\bpercent\b/i.test(mnemonic) && /\d/.test(mnemonic);
    if (looksQuantitative && !CONDITION_SIGNAL.test(explanation)) {
      rejections.push("shortcut-missing-conditions");
    }

    const acronyms = acronymTokens(mnemonic);
    if (family === "acronymic" || acronyms.length > 0) {
      const items = listItems(target);
      const letters = acronyms.length ? Math.max(...acronyms.map((token) => token.length)) : 0;
      if (family === "acronymic" && items.length < 3) {
        // Nothing to encode: an acronym over a heading or a single sentence
        // is a second thing to memorise, not a shortcut.
        rejections.push("no-list-to-encode");
      }
      if (letters > 0 && items.length < letters) rejections.push("acronym-not-supported-by-target");
      const targetInitials = new Set(
        listItems(target)
          .map((item) => contentWords(item)[0]?.[0])
          .filter(Boolean) as string[],
      );
      for (const token of acronyms) {
        const mapped = token.toLowerCase().split("").filter((letter) => targetInitials.has(letter));
        if (mapped.length < token.length) {
          rejections.push("acronym-letters-not-in-target");
          break;
        }
      }
    }
  }

  /* ----------------------- 3. Usefulness gate ----------------------- */
  const mnemonicWords = words(mnemonic);
  if (mnemonic.length < 3) rejections.push("empty");
  if (!verified) {
    if (mnemonic.length > 220 || mnemonicWords.length > 32) rejections.push("too-long");
    if (mnemonicWords.length > words(target).length * 2 + 6) rejections.push("harder-than-the-fact");
    if (GENERIC_FILLER.test(mnemonic)) rejections.push("not-memorable");

    const targetVocabulary = new Set([
      ...contentWords(target),
      ...contentWords(context.conceptName ?? ""),
    ]);
    const novel = contentWords(mnemonic).filter((word) => !targetVocabulary.has(word));
    if (normalize(mnemonic).includes(normalize(target)) && target.length > 12) {
      rejections.push("circular");
    } else if (new Set(novel).size < 2) {
      rejections.push("circular");
    } else {
      // Chanting the term is not a cue: "mitosis means mitosis, mitosis is
      // just mitosis" adds a filler word and no hook.
      const counts = new Map<string, number>();
      for (const word of contentWords(mnemonic)) counts.set(word, (counts.get(word) ?? 0) + 1);
      const chanted = [...counts.values()].some((count) => count >= 3);
      if (chanted && new Set(novel).size < 4) rejections.push("circular");
    }
    if (explanation.length < 3) rejections.push("no-explanation");
  }

  /* --------------------------- 4. Fit score --------------------------- */
  let score = 1;
  const profile = getSubjectProfile((context.subjectProfileId ?? null) as SubjectProfileId | null);
  if (profile.preferredTechniques.includes(candidate.technique)) {
    score += 2;
    reasons.push(`fits ${profile.label}`);
  }
  if (profile.avoidTechniques.includes(candidate.technique)) {
    score -= 3;
    reasons.push(`usually misfires for ${profile.label}`);
  }
  const taskBonus: Record<string, MnemonicTechniqueFamily[]> = {
    "sequence-events": ["story", "chunking"],
    "solve-problems": ["pattern", "chunking"],
    "apply-procedure": ["pattern", "chunking"],
    "compare-ideas": ["contrast"],
    "memorize-terms": ["association", "visual", "spatial", "acronymic", "sound"],
    "understand-concept": ["contrast", "association", "visual"],
  };
  if (context.taskKind && (taskBonus[context.taskKind] ?? []).includes(family)) {
    score += 2;
    reasons.push("matches what this task asks for");
  }
  if ((context.avoidTechniques ?? []).includes(candidate.technique)) {
    score -= 2;
    reasons.push("this student rated this technique unhelpful");
  }
  if (verified) {
    score += 3;
    reasons.push("deterministically verified");
  }
  if ((context.rejectFamilies ?? []).includes(family)) {
    rejections.push("family-already-rejected");
  }

  return {
    accepted: rejections.length === 0 && score >= 1,
    score,
    rejections,
    reasons,
    family,
    displayLabel: techniqueDisplayLabel(candidate.technique, verified),
  };
}

export interface MnemonicSelection {
  candidate: MnemonicCandidate;
  verdict: MnemonicQualityVerdict;
  index: number;
}

/**
 * Chooses the best candidate from ONE model call. Never asks for more
 * candidates and never retries: if nothing clears the gate, the caller shows
 * the practice fallback instead.
 */
export function selectBestMnemonicCandidate(
  candidates: readonly MnemonicCandidate[],
  context: MnemonicQualityContext,
): MnemonicSelection | null {
  const scored = candidates.map((candidate, index) => ({
    candidate,
    verdict: evaluateMnemonicCandidate(candidate, context),
    index,
  }));
  const accepted = scored.filter((entry) => entry.verdict.accepted);
  if (!accepted.length) return null;
  accepted.sort((left, right) => (
    right.verdict.score - left.verdict.score || left.index - right.index
  ));
  return accepted[0];
}

/** Turns a self-checked math shortcut into a candidate with no model call. */
export function candidateFromVerifiedShortcut(shortcut: VerifiedShortcut): MnemonicCandidate {
  return {
    mnemonic: `${shortcut.statement} ${shortcut.example}`.trim(),
    technique: "worked_example",
    explanation: `${shortcut.why} ${shortcut.conditions}`.trim(),
    verified: true,
  };
}

/** Student-facing copy when no candidate clears the gate. */
export function mnemonicFallbackSuggestion(context: MnemonicQualityContext): {
  message: string;
  strategyId: string;
} {
  const profile = getSubjectProfile((context.subjectProfileId ?? null) as SubjectProfileId | null);
  const strategyId = profile.preferredTechniques.includes("worked_example")
    ? "worked-example"
    : context.taskKind === "compare-ideas"
      ? "compare-table"
      : "retrieval-question";
  return {
    message: "No useful memory trick for this one. Let’s practice it instead.",
    strategyId,
  };
}

/** The family to move to when the student says "try another way". */
export function nextTechniqueFamily(
  currentTechnique: string,
  context: MnemonicQualityContext,
): MnemonicTechniqueFamily {
  const current = techniqueFamily(currentTechnique);
  const profile = getSubjectProfile((context.subjectProfileId ?? null) as SubjectProfileId | null);
  const rejected = new Set([current, ...(context.rejectFamilies ?? [])]);
  for (const technique of profile.preferredTechniques) {
    const family = techniqueFamily(technique);
    if (!rejected.has(family)) return family;
  }
  const order: MnemonicTechniqueFamily[] = [
    "association", "visual", "story", "chunking", "contrast", "spatial", "pattern", "sound",
  ];
  return order.find((family) => !rejected.has(family)) ?? "other";
}
