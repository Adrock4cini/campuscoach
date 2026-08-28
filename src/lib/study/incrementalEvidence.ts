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

export type StoredEvidenceConfidence = "low" | "medium" | "high";

export interface StudyResultConceptScore {
  conceptId: string;
  correct: boolean;
  confidence: StoredEvidenceConfidence;
  recovered: boolean;
  /** Immutable first MC choice; the server derives correctness from it. */
  firstSelectedIndex?: number;
}

/** Immutable request body for one segment of a logical study run. */
export interface StudyResultSegmentBody {
  attemptId: string;
  studyRunId: string;
  segmentIndex: number;
  segmentFinal: boolean;
  artifactId: string;
  correct: number;
  total: number;
  /** Active time since the preceding segment, never cumulative run time. */
  durationSeconds: number;
  perConcept: StudyResultConceptScore[];
}

export interface StudyResultSegmentResponse {
  ok: true;
  sessionId: string;
  readiness?: number;
  readinessBefore?: number;
  readinessDelta?: number;
}

export interface EvidenceSegment<T extends EvidenceResult = EvidenceResult> {
  results: T[];
  correct: number;
  total: number;
  /** Number of raw result entries consumed, including recovery answers. */
  resultCount: number;
}

export interface DurableEvidenceRequest<TBody> {
  attemptId: string;
  body: TBody;
  /** Raw result cursor movement; recovery answers count here. */
  resultCount: number;
  /** First-attempt answers represented by this request. */
  answerCount: number;
}

/**
 * Small in-memory outbox for incremental result requests. A request stays at
 * the head until the server acknowledges it, so a lost response is retried
 * with the exact same attempt id and body.
 */
export interface DurableEvidenceOutbox<TBody, TResponse> {
  pending: DurableEvidenceRequest<TBody>[];
  queuedResultCount: number;
  savedResultCount: number;
  savedAnswerCount: number;
  lastResponse: TResponse | null;
  active: Promise<TResponse | null> | null;
}

export type DurableEvidenceOutboxSnapshot<TBody, TResponse> = Omit<
  DurableEvidenceOutbox<TBody, TResponse>,
  "active"
>;

export function createEvidenceOutbox<TBody, TResponse>(): DurableEvidenceOutbox<TBody, TResponse> {
  return {
    pending: [],
    queuedResultCount: 0,
    savedResultCount: 0,
    savedAnswerCount: 0,
    lastResponse: null,
    active: null,
  };
}

export function snapshotEvidenceOutbox<TBody, TResponse>(
  outbox: DurableEvidenceOutbox<TBody, TResponse>,
): DurableEvidenceOutboxSnapshot<TBody, TResponse> {
  return {
    pending: [...outbox.pending],
    queuedResultCount: outbox.queuedResultCount,
    savedResultCount: outbox.savedResultCount,
    savedAnswerCount: outbox.savedAnswerCount,
    lastResponse: outbox.lastResponse,
  };
}

export function restoreEvidenceOutbox<TBody, TResponse>(
  snapshot: DurableEvidenceOutboxSnapshot<TBody, TResponse>,
): DurableEvidenceOutbox<TBody, TResponse> {
  return {
    pending: [...snapshot.pending],
    queuedResultCount: snapshot.queuedResultCount,
    savedResultCount: snapshot.savedResultCount,
    savedAnswerCount: snapshot.savedAnswerCount,
    lastResponse: snapshot.lastResponse,
    active: null,
  };
}

export function enqueueEvidenceRequest<TBody, TResponse>(
  outbox: DurableEvidenceOutbox<TBody, TResponse>,
  request: DurableEvidenceRequest<TBody>,
) {
  outbox.pending.push(request);
  outbox.queuedResultCount += request.resultCount;
}

/**
 * Drain one outbox at a time. Concurrent callers join the same active pump;
 * requests appended while it is running are handled before the drain ends.
 * A failed request remains queued and can be retried idempotently later.
 */
export async function drainEvidenceOutbox<TBody, TResponse>(
  outbox: DurableEvidenceOutbox<TBody, TResponse>,
  send: (request: DurableEvidenceRequest<TBody>) => Promise<TResponse>,
  onAcknowledged?: (outbox: DurableEvidenceOutbox<TBody, TResponse>) => void,
): Promise<TResponse | null> {
  while (outbox.pending.length > 0 || outbox.active) {
    if (!outbox.active) {
      const active: Promise<TResponse | null> = (async () => {
        while (outbox.pending.length > 0) {
          const request = outbox.pending[0];
          const response = await send(request);
          // Only move the cursor after an acknowledgement. If `send` throws,
          // this exact object remains queued for an idempotent retry.
          outbox.pending.shift();
          outbox.savedResultCount += request.resultCount;
          outbox.savedAnswerCount += request.answerCount;
          outbox.lastResponse = response;
          onAcknowledged?.(outbox);
        }
        return outbox.lastResponse;
      })().finally(() => {
        if (outbox.active === active) outbox.active = null;
      });
      outbox.active = active;
    }
    await outbox.active;
  }
  return outbox.lastResponse;
}

/**
 * A first-attempt miss is not settled until its recovery pass has been
 * answered — flushing it early would write a miss and then a separate
 * "correct" for the same concept, which is exactly how retries inflate
 * mastery. Mid-session flushes therefore stop at the first unsettled miss.
 */
function settledPrefix<T extends EvidenceResult>(pending: T[]): T[] {
  const unsettledMisses = new Map<string, number>();
  let lastSettledIndex = 0;
  let unsettledCount = 0;

  for (const [index, entry] of pending.entries()) {
    if (entry.recovery) {
      const count = unsettledMisses.get(entry.conceptId) ?? 0;
      if (count > 0) {
        unsettledCount -= 1;
        if (count === 1) unsettledMisses.delete(entry.conceptId);
        else unsettledMisses.set(entry.conceptId, count - 1);
      }
    } else if (!entry.correct) {
      unsettledMisses.set(entry.conceptId, (unsettledMisses.get(entry.conceptId) ?? 0) + 1);
      unsettledCount += 1;
    }

    // Keep the longest prefix in which every miss and its recovery travel in
    // the same request. This avoids losing `recovered` when misses interleave.
    if (unsettledCount === 0) lastSettledIndex = index + 1;
  }

  return pending.slice(0, lastSettledIndex);
}

/**
 * The slice of results that has not been persisted yet. Returns null when
 * there is nothing new to save. Pass `final` when the session is closing so
 * every remaining answer is included.
 */
export function pendingEvidenceSegment<T extends EvidenceResult>(
  results: T[],
  resultCursor: number,
  options: { final?: boolean } = {},
): EvidenceSegment<T> | null {
  const start = Math.max(0, Math.min(resultCursor, results.length));
  const remaining = results.slice(start);
  const pending = options.final ? remaining : settledPrefix(remaining);
  if (!pending.length) return null;
  const firstAttempts = pending.filter((entry) => !entry.recovery).length;
  return {
    results: pending,
    correct: pending.filter((entry) => entry.correct && !entry.recovery).length,
    // Recovery passes teach; they never add to the graded item count.
    total: Math.max(1, firstAttempts),
    resultCount: pending.length,
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
