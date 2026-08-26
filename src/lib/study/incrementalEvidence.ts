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
 * A first-attempt miss is not settled until its recovery pass has been
 * answered — flushing it early would write a miss and then a separate
 * "correct" for the same concept, which is exactly how retries inflate
 * mastery. Mid-session flushes therefore stop at the first unsettled miss.
 */
function settledPrefix<T extends EvidenceResult>(pending: T[], all: T[], start: number): T[] {
  const out: T[] = [];
  for (const [offset, entry] of pending.entries()) {
    const settled = entry.recovery
      || entry.correct
      || all.slice(start + offset + 1).some(
        (later) => later.recovery && later.conceptId === entry.conceptId,
      );
    if (!settled) break;
    out.push(entry);
  }
  return out;
}

/**
 * The slice of results that has not been persisted yet. Returns null when
 * there is nothing new to save. Pass `final` when the session is closing so
 * every remaining answer is included.
 */
export function pendingEvidenceSegment<T extends EvidenceResult>(
  results: T[],
  savedCount: number,
  options: { final?: boolean } = {},
): EvidenceSegment<T> | null {
  const start = Math.max(0, Math.min(savedCount, results.length));
  const remaining = results.slice(start);
  const pending = options.final ? remaining : settledPrefix(remaining, results, start);
  if (!pending.length) return null;
  const firstAttempts = pending.filter((entry) => !entry.recovery).length;
  return {
    results: pending,
    correct: pending.filter((entry) => entry.correct && !entry.recovery).length,
    // Recovery passes teach; they never add to the graded item count.
    total: Math.max(1, firstAttempts),
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
