export type StudySelectionSignal =
  | "explicit_concept"
  | "explicit_capture"
  | "explicit_exam_link"
  | "exam_topic"
  | "exam_window"
  | "review_due"
  | "low_mastery"
  | "unseen"
  | "teacher_emphasis"
  | "recent";

export interface StudySelectionConcept {
  id: string;
  name: string;
  definition?: string | null;
  examples?: string[] | null;
  professor_emphasis?: boolean | null;
  capture_id?: string | null;
  created_at: string;
}

export interface StudySelectionMastery {
  concept_id: string;
  strength?: number | null;
  attempts?: number | null;
  correct?: number | null;
  last_seen_at?: string | null;
  next_review_at?: string | null;
}

export interface StudySelectionContext {
  scopeType: "recent" | "exam" | "class";
  now: string;
  limit: number;
  topics?: string[];
  examDate?: string | null;
  previousExamDate?: string | null;
  explicitConceptIds?: Iterable<string>;
  explicitCaptureId?: string | null;
  explicitExamCaptureIds?: Iterable<string>;
}

export interface StudySelectionEvidence {
  signal: StudySelectionSignal;
  label: string;
  weight: number;
}

export interface RankedStudyConcept<T extends StudySelectionConcept = StudySelectionConcept> {
  concept: T;
  score: number;
  evidence: StudySelectionEvidence[];
  mastery: {
    strength: number | null;
    attempts: number;
    correct: number;
    lastSeenAt: string | null;
    nextReviewAt: string | null;
  };
}

const COACH_SCOPE_ID_PATTERN = /^coach-[a-z0-9]{1,16}$/;

export function resolveClassStudyScope(
  requestedId: string,
  hasExplicitConcepts: boolean,
) {
  const isCoachScope = hasExplicitConcepts && COACH_SCOPE_ID_PATTERN.test(requestedId);
  return {
    type: "class" as const,
    id: isCoachScope ? requestedId : "class",
    label: isCoachScope ? "Coach picks" : "Everything in this class",
    topics: [] as string[],
  };
}

const TOPIC_ALIASES: Record<string, string[]> = {
  addition: ["addition", "add", "plus", "sum"],
  subtraction: ["subtraction", "subtract", "minus", "difference"],
  multiplication: ["multiplication", "multiply", "times", "product"],
  division: ["division", "divide", "quotient"],
};

const DAY_MS = 24 * 60 * 60 * 1000;

function asTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStudyText(value: string) {
  return value
    .toLowerCase()
    .replace(/[×]/g, " * ")
    .replace(/[÷]/g, " / ")
    .replace(/[^\p{L}\p{N}+*/.%-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandTopic(topic: string) {
  const normalized = normalizeStudyText(topic);
  if (!normalized) return [];
  const aliases = TOPIC_ALIASES[normalized] ?? [];
  return [...new Set([normalized, ...aliases.map(normalizeStudyText)])];
}

function conceptSearchText(concept: StudySelectionConcept) {
  const normalized = normalizeStudyText([
    concept.name,
    concept.definition,
    ...(concept.examples ?? []),
  ].filter(Boolean).join(" "));
  const inferred: string[] = [];
  if (/\d\s*\+\s*\d/.test(normalized)) inferred.push(...TOPIC_ALIASES.addition);
  if (/\d\s*-\s*\d/.test(normalized)) inferred.push(...TOPIC_ALIASES.subtraction);
  if (/\d\s*\*\s*\d/.test(normalized)) inferred.push(...TOPIC_ALIASES.multiplication);
  if (/\d\s*\/\s*\d/.test(normalized)) inferred.push(...TOPIC_ALIASES.division);
  return `${normalized} ${inferred.join(" ")}`.trim();
}

function isInExamWindow(
  createdAt: string,
  examDate?: string | null,
  previousExamDate?: string | null,
) {
  const created = asTimestamp(createdAt);
  if (created === null || !examDate) return false;
  const end = asTimestamp(`${examDate}T23:59:59.999Z`);
  const start = previousExamDate
    ? asTimestamp(`${previousExamDate}T23:59:59.999Z`)
    : null;
  return end !== null && created <= end && (start === null || created > start);
}

function recentWeight(createdAt: string, now: number) {
  const created = asTimestamp(createdAt);
  if (created === null) return 0;
  const ageDays = Math.max(0, (now - created) / DAY_MS);
  if (ageDays <= 2) return 15;
  if (ageDays <= 7) return 12;
  if (ageDays <= 14) return 8;
  if (ageDays <= 30) return 4;
  return 0;
}

function addEvidence(
  evidence: StudySelectionEvidence[],
  signal: StudySelectionSignal,
  label: string,
  weight: number,
) {
  if (weight > 0) evidence.push({ signal, label, weight });
}

/**
 * Deterministically chooses the concepts that deserve attention now. The
 * function is deliberately pure so ranking changes can be regression tested
 * without a database or an AI model.
 */
export function rankStudyConcepts<T extends StudySelectionConcept>(
  concepts: T[],
  masteryRows: StudySelectionMastery[],
  context: StudySelectionContext,
): Array<RankedStudyConcept<T>> {
  const now = asTimestamp(context.now) ?? 0;
  const limit = Math.max(0, Math.min(100, Math.trunc(context.limit)));
  const explicitConceptIds = new Set(context.explicitConceptIds ?? []);
  const explicitExamCaptureIds = new Set(context.explicitExamCaptureIds ?? []);
  const masteryByConcept = new Map(masteryRows.map((row) => [row.concept_id, row]));
  const topicTerms = (context.topics ?? []).flatMap(expandTopic).filter(Boolean);

  const scored = concepts.flatMap((concept): Array<RankedStudyConcept<T>> => {
    const explicitlySelected = explicitConceptIds.has(concept.id);
    const explicitCapture = Boolean(
      context.explicitCaptureId && concept.capture_id === context.explicitCaptureId,
    );
    const explicitExamLink = Boolean(
      concept.capture_id && explicitExamCaptureIds.has(concept.capture_id),
    );
    const searchText = conceptSearchText(concept);
    const examTopic = context.scopeType === "exam" && topicTerms.some((topic) => searchText.includes(topic));
    const examWindow = context.scopeType === "exam" && isInExamWindow(
      concept.created_at,
      context.examDate,
      context.previousExamDate,
    );

    // Direct actions must stay direct. Exam study is intentionally fail-closed
    // to concepts with an explicit link, a named topic, or the assessment
    // window. Class/recent scopes already arrive inside their owner boundary.
    if (explicitConceptIds.size && !explicitlySelected) return [];
    if (!explicitConceptIds.size && context.explicitCaptureId && !explicitCapture) return [];
    if (
      !explicitConceptIds.size
      && !context.explicitCaptureId
      && context.scopeType === "exam"
      && !explicitExamLink
      && !examTopic
      && !examWindow
    ) return [];

    const evidence: StudySelectionEvidence[] = [];
    addEvidence(evidence, "explicit_concept", "You selected this concept", explicitlySelected ? 100 : 0);
    addEvidence(evidence, "explicit_capture", "From the capture you selected", explicitCapture ? 95 : 0);
    addEvidence(evidence, "explicit_exam_link", "Capture linked directly to this test", explicitExamLink ? 80 : 0);
    addEvidence(evidence, "exam_topic", "Matches a named test topic", examTopic ? 50 : 0);
    addEvidence(evidence, "exam_window", "Captured in this test's likely class window", examWindow ? 25 : 0);

    const mastery = masteryByConcept.get(concept.id);
    const attempts = Math.max(0, Math.trunc(Number(mastery?.attempts) || 0));
    const correct = Math.max(0, Math.trunc(Number(mastery?.correct) || 0));
    const rawStrength = mastery?.strength;
    const strength = typeof rawStrength === "number" && Number.isFinite(rawStrength)
      ? Math.max(0, Math.min(1, rawStrength))
      : null;
    const nextReview = asTimestamp(mastery?.next_review_at);
    if (nextReview !== null && nextReview <= now) {
      addEvidence(evidence, "review_due", "Spaced review is due", 30);
    }
    if (!mastery || attempts === 0) {
      addEvidence(evidence, "unseen", "Not successfully practiced yet", 28);
    } else if (strength !== null && strength < 0.7) {
      addEvidence(
        evidence,
        "low_mastery",
        `Needs practice (${Math.round(strength * 100)}% mastery)`,
        Math.max(4, Math.round((0.7 - strength) * 40)),
      );
    }
    addEvidence(
      evidence,
      "teacher_emphasis",
      "Teacher or instructor emphasized it",
      concept.professor_emphasis ? 20 : 0,
    );
    const recency = recentWeight(concept.created_at, now);
    addEvidence(evidence, "recent", "Recently captured", recency);

    return [{
      concept,
      score: evidence.reduce((sum, item) => sum + item.weight, 0),
      evidence,
      mastery: {
        strength,
        attempts,
        correct,
        lastSeenAt: mastery?.last_seen_at ?? null,
        nextReviewAt: mastery?.next_review_at ?? null,
      },
    }];
  });

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightCreated = asTimestamp(right.concept.created_at) ?? 0;
      const leftCreated = asTimestamp(left.concept.created_at) ?? 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return left.concept.id.localeCompare(right.concept.id);
    })
    .slice(0, limit);
}

export function studySelectionSnapshot(ranked: RankedStudyConcept[]) {
  return ranked.map((item, index) => ({
    rank: index + 1,
    conceptId: item.concept.id,
    conceptName: item.concept.name,
    score: item.score,
    mastery: item.mastery,
    signals: item.evidence,
  }));
}
