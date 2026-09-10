/**
 * Phonetic / wordplay bridges.
 *
 * A phonetic bridge is a SHORT invented sentence or image in which one word
 * sounds like the prompt and another sounds like the answer, so that seeing
 * the prompt pulls the answer back:
 *
 *   Maryland -> Annapolis        "Marilyn picks apples."
 *   (Marilyn cues Maryland, apples cues Annapolis)
 *
 * The sentence is NOT etymology, history, or explanation. It is an invented
 * recall bridge and must always be labelled as one.
 *
 * This module is deterministic. It scores a candidate bridge on the six
 * things that make a bridge work — cue similarity, answer similarity,
 * imageability, brevity, two-way mapping, distinctiveness — and rejects the
 * clever sentences that do not map back to the fact. It never authors AI
 * content; the curated table below is human-written and needs no model call.
 */

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "he", "her",
  "his", "in", "into", "is", "it", "its", "of", "on", "or", "she", "that",
  "the", "their", "them", "then", "there", "they", "this", "to", "up", "was",
  "were", "with", "you", "your", "capital", "city", "term", "called", "means",
  "located", "location", "name", "named", "definition",
]);

/** Wording that would turn an invented cue into a false factual claim. */
export const MISLEADING_FACT_CLAIM =
  /\b(named after|comes from|derives? from|derived from|is why it(?:'|’)?s called|literally means|etymolog|historically|in latin|in greek|the word originates)\b/i;

export interface PhoneticBridgeScore {
  /** 0-1 sound overlap between the bridge and the prompt term. */
  cueSimilarity: number;
  /** 0-1 sound overlap between the bridge and the answer term. */
  answerSimilarity: number;
  /** 0-1 how concrete and picture-able the bridge is. */
  imageability: number;
  /** 0-1 brevity: short bridges win. */
  brevity: number;
  /** True when BOTH ends are cued, so the bridge maps back to the fact. */
  twoWayMapping: boolean;
  /** 0-1 how much new, distinctive vocabulary the bridge adds. */
  distinctiveness: number;
  /** Combined 0-10 quality score. */
  score: number;
  /** Hard failures. Non-empty means the bridge must not be shown. */
  rejections: string[];
}

function letters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/** Rough sound skeleton: collapse doubles and normalise common spellings. */
export function soundSkeleton(word: string): string {
  let out = letters(word)
    .replace(/ph/g, "f")
    .replace(/ck|q/g, "k")
    .replace(/y/g, "i")
    .replace(/z/g, "s")
    .replace(/kn|gn/g, "n");
  out = out.replace(/(.)\1+/g, "$1");
  return out;
}

function lcsLength(a: string, b: string): number {
  if (!a || !b) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const row = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0-1 sound overlap of two single words. */
export function soundOverlap(left: string, right: string): number {
  const a = soundSkeleton(left);
  const b = soundSkeleton(right);
  if (a.length < 3 || b.length < 3) return 0;
  const shared = lcsLength(a, b);
  const ratio = shared / Math.min(a.length, b.length);
  // A shared opening sound is what a student actually reaches for.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  const prefixBonus = prefix >= 3 ? 0.15 : 0;
  return Math.min(1, Math.max(0, ratio - 0.15) + prefixBonus);
}

export function bridgeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

/** The best sound overlap between any bridge word and any target word. */
function bestOverlap(bridge: string, term: string): number {
  const targets = bridgeWords(term);
  if (!targets.length) return 0;
  let best = 0;
  for (const word of bridgeWords(bridge)) {
    for (const target of targets) {
      best = Math.max(best, soundOverlap(word, target));
    }
  }
  return best;
}

const ABSTRACT = /\b(concept|process|system|value|factor|aspect|idea|theory|principle|method|function|structure)\b/i;

export interface PhoneticBridgeInput {
  /** The invented bridge sentence. */
  bridge: string;
  /** What the student sees first (concept/term/place). */
  cueTerm: string;
  /** What they must retrieve (capital, definition, location...). */
  answerTerm: string;
  /** How the bridge is explained to the student, if any. */
  explanation?: string | null;
}

/**
 * Scores one bridge. Rewards cue similarity, answer similarity, concrete
 * imagery, brevity, two-way mapping and distinctiveness; penalises extra
 * arbitrary hops, misleading factual wording, unpronounceable stretches, and
 * any bridge that is harder to hold than the fact itself.
 */
export function scorePhoneticBridge(input: PhoneticBridgeInput): PhoneticBridgeScore {
  const rejections: string[] = [];
  const bridge = (input.bridge ?? "").trim();
  const words = bridgeWords(bridge);
  const cueSimilarity = bestOverlap(bridge, input.cueTerm ?? "");
  const answerSimilarity = bestOverlap(bridge, input.answerTerm ?? "");

  const concrete = words.filter((word) => word.length <= 10 && !ABSTRACT.test(word));
  const imageability = words.length ? Math.min(1, concrete.length / Math.max(3, words.length)) : 0;
  const brevity = words.length === 0 ? 0 : Math.max(0, Math.min(1, (10 - words.length) / 7));
  const twoWayMapping = cueSimilarity >= 0.45 && answerSimilarity >= 0.45;
  const cueVocabulary = new Set([...bridgeWords(input.cueTerm ?? ""), ...bridgeWords(input.answerTerm ?? "")]);
  const novel = words.filter((word) => !cueVocabulary.has(word));
  const distinctiveness = words.length ? Math.min(1, novel.length / Math.max(2, words.length)) : 0;

  if (!bridge || words.length < 2) rejections.push("bridge-too-thin");
  if (cueSimilarity < 0.45) rejections.push("bridge-does-not-cue-the-prompt");
  if (answerSimilarity < 0.45) rejections.push("bridge-does-not-cue-the-answer");
  // A bridge you have to work harder to remember than the fact is a loss.
  if (words.length > 12) rejections.push("bridge-harder-than-the-fact");
  if (MISLEADING_FACT_CLAIM.test(`${bridge} ${input.explanation ?? ""}`)) {
    rejections.push("bridge-implies-a-false-fact");
  }
  // Unpronounceable stretches ("Mrlnd Anplsz") are not sound-alikes.
  if (words.some((word) => !/[aeiouy]/.test(word))) rejections.push("bridge-not-pronounceable");

  const score = Math.round(
    (cueSimilarity * 3 + answerSimilarity * 3 + imageability * 1.5 + brevity * 1.5
      + (twoWayMapping ? 1 : 0) + distinctiveness) * 10,
  ) / 10;

  return {
    cueSimilarity,
    answerSimilarity,
    imageability,
    brevity,
    twoWayMapping,
    distinctiveness,
    score,
    rejections,
  };
}

export interface CuratedBridge {
  cue: string;
  answer: string;
  bridge: string;
  explanation: string;
}

/**
 * Human-written bridges. When one matches, Make It Stick uses it with ZERO
 * model calls. Everything here is an invented cue, never a factual claim.
 */
export const CURATED_PHONETIC_BRIDGES: CuratedBridge[] = [
  {
    cue: "maryland",
    answer: "annapolis",
    bridge: "Marilyn picks apples.",
    explanation: "Made-up cue: “Marilyn” sounds like Maryland and “apples” sounds like Annapolis.",
  },
  {
    cue: "kentucky",
    answer: "frankfort",
    bridge: "Frank forted up in Kentucky.",
    explanation: "Made-up cue: “Frank” sounds like Frankfort, tied to the Kentucky turkey.",
  },
  {
    cue: "oregon",
    answer: "salem",
    bridge: "Oregon sails home with salami.",
    explanation: "Made-up cue: “salami” sounds like Salem.",
  },
  {
    cue: "clavicle",
    answer: "collarbone",
    bridge: "A claw on your collar — clavicle.",
    explanation: "Made-up cue: “claw” sounds like clavicle and sits at the collar.",
  },
];

function normalizedTerm(value: string): string {
  return letters(value);
}

/**
 * Looks up a curated bridge for this prompt/answer pair. Matching is on the
 * two terms only, so a curated hit is safe to reuse across students.
 */
export function findCuratedPhoneticBridge(
  cueTerm: string,
  answerTerm: string,
): CuratedBridge | null {
  const cue = normalizedTerm(cueTerm ?? "");
  const answer = normalizedTerm(answerTerm ?? "");
  if (!cue || !answer) return null;
  return CURATED_PHONETIC_BRIDGES.find((entry) => (
    cue.includes(entry.cue) && answer.includes(entry.answer)
  )) ?? null;
}
