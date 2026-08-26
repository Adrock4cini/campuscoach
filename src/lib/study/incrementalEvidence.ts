/**
 * Incremental study evidence.
 *
 * A student who closes the tab on card 7 must keep the evidence from cards
 * 1-6. Each scored answer is therefore flushed as its own small, idempotent
 * segment instead of waiting for a clean session close.
 *
 * Retries ("recovery" passes) are carried through with their flag intact so
 * mastery is never inflated by a second look at the same card.
 */

export interface EvidenceResult {
  conceptId: string;
  correct: boolean;
  confidence: string;
  recovery: boolean;
}

export interface EvidenceSegment<T extends EvidenceResult = EvidenceResult> {
  results: T[];
  correct: number;
  total: number;
}

/**
 * The slice of results that has not been persisted yet. Returns null when
 * there is nothing new to save.
 */
export function pendingEvidenceSegment<T extends EvidenceResult>(
  results: T[],
  savedCount: number,
): EvidenceSegment<T> | null {
  const start = Math.max(0, Math.min(savedCount, results.length));
  const pending = results.slice(start);
  if (!pending.length) return null;
  return {
    results: pending,
    correct: pending.filter((entry) => entry.correct && !entry.recovery).length,
    total: pending.length,
  };
}

/**
 * Leave-confirmation copy must never contradict what was already stored.
 */
export function leaveSessionCopy(savedCount: number): string {
  if (savedCount <= 0) {
    return "You haven't answered anything yet, so there's nothing to lose.";
  }
  const noun = savedCount === 1 ? "answer" : "answers";
  return `Your progress so far is saved (${savedCount} ${noun}). Anything you skip now just won't count yet.`;
}
