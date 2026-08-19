import { useEffect, useMemo, useRef, useState } from "react";
import {
  isMatchingChoicePermutation,
  randomMatchingShuffle,
  validateMatchingPayload,
  type GroundedMatchingPair,
  type MatchingCompletionResult,
  type MatchingPayload,
  type MatchingRightChoice,
  type MatchingShuffle,
} from "@/lib/learningArtifacts/matchingGame";
import { cleanStudyText } from "@/lib/study/studyText";

export interface RealMatchingGameProps {
  payload: MatchingPayload;
  allowedConceptIds: readonly string[];
  onComplete: (result: MatchingCompletionResult) => void;
  shuffle?: MatchingShuffle;
}

interface ValidGameProps extends Omit<RealMatchingGameProps, "payload"> {
  pairs: GroundedMatchingPair[];
}

function gameFingerprint(pairs: readonly GroundedMatchingPair[]): string {
  return JSON.stringify(
    pairs.map(({ id, conceptId, conceptName, left, right, sourceExcerpt }) => [
      id,
      conceptId,
      conceptName,
      left,
      right,
      sourceExcerpt ?? null,
    ]),
  );
}

export function RealMatchingGame({
  payload,
  allowedConceptIds,
  onComplete,
  shuffle = randomMatchingShuffle,
}: RealMatchingGameProps) {
  const validated = useMemo(
    () => validateMatchingPayload(payload, allowedConceptIds),
    [allowedConceptIds, payload],
  );

  if (!validated) {
    return (
      <section
        aria-labelledby="matching-unavailable-title"
        className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-center"
      >
        <h2 id="matching-unavailable-title" className="font-semibold text-foreground">
          Match Lab unavailable
        </h2>
        <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This study set could not be verified: Match Lab needs at least three clearly different
          term-and-answer pairs. Refresh this set, or study it as flashcards while you add a little
          more detail.
        </p>
      </section>
    );
  }

  return (
    <MatchingBoard
      key={gameFingerprint(validated.pairs)}
      pairs={validated.pairs}
      allowedConceptIds={allowedConceptIds}
      onComplete={onComplete}
      shuffle={shuffle}
    />
  );
}

function MatchingBoard({ pairs, onComplete, shuffle }: ValidGameProps) {
  const [shuffledRights] = useState<MatchingRightChoice[] | null>(() => {
    const expectedChoices = pairs.map<MatchingRightChoice>((pair) => ({
      pairId: pair.id,
      label: pair.right,
    }));

    try {
      const result = shuffle?.(expectedChoices.map((choice) => ({ ...choice }))) ?? expectedChoices;
      return isMatchingChoicePermutation(result, expectedChoices)
        ? result
        : null;
    } catch {
      return null;
    }
  });

  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [firstAttemptByPair, setFirstAttemptByPair] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("Choose a term, then choose its match.");
  const [messageKind, setMessageKind] = useState<"instruction" | "correct" | "incorrect">("instruction");
  const [openSources, setOpenSources] = useState<Set<string>>(() => new Set());
  const completedRef = useRef(false);
  const completionRef = useRef<HTMLDivElement>(null);
  const leftButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const rightButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const allMatched = matchedPairIds.length === pairs.length;

  useEffect(() => {
    if (!selectedPairId) return;
    const firstChoice = shuffledRights?.find((choice) => !matchedPairIds.includes(choice.pairId));
    // `preventScroll` keeps the a11y focus move without yanking a phone's
    // viewport to the other column mid-tap, which read as "matching is broken".
    if (firstChoice) rightButtonRefs.current.get(firstChoice.pairId)?.focus({ preventScroll: true });
  }, [matchedPairIds, selectedPairId, shuffledRights]);

  useEffect(() => {
    if (matchedPairIds.length === pairs.length) return;
    const matched = new Set(matchedPairIds);
    const nextPair = pairs.find((pair) => !matched.has(pair.id));
    if (nextPair) leftButtonRefs.current.get(nextPair.id)?.focus({ preventScroll: true });
  }, [matchedPairIds, pairs]);

  useEffect(() => {
    if (
      completedRef.current
      || matchedPairIds.length !== pairs.length
      || pairs.length === 0
    ) {
      return;
    }

    completedRef.current = true;
    const conceptOrder: string[] = [];
    const conceptResults = new Map<string, { firstAttemptCorrect: boolean; recovered: boolean }>();

    for (const pair of pairs) {
      const pairWasCorrect = firstAttemptByPair[pair.id] === true;
      const existing = conceptResults.get(pair.conceptId);
      if (!existing) {
        conceptOrder.push(pair.conceptId);
        conceptResults.set(pair.conceptId, {
          firstAttemptCorrect: pairWasCorrect,
          recovered: !pairWasCorrect,
        });
      } else {
        existing.firstAttemptCorrect = existing.firstAttemptCorrect && pairWasCorrect;
        existing.recovered = existing.recovered || !pairWasCorrect;
      }
    }

    onComplete({
      correctFirstAttempt: pairs.filter((pair) => firstAttemptByPair[pair.id] === true).length,
      total: pairs.length,
      perConcept: conceptOrder.map((conceptId) => ({
        conceptId,
        ...conceptResults.get(conceptId)!,
      })),
    });
  }, [firstAttemptByPair, matchedPairIds.length, onComplete, pairs]);

  useEffect(() => {
    if (allMatched) completionRef.current?.focus();
  }, [allMatched]);

  if (!shuffledRights) {
    return (
      <section className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-center">
        <h2 className="font-semibold text-foreground">Match Lab unavailable</h2>
        <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The matching choices could not be prepared safely. Refresh this study set and try again.
        </p>
      </section>
    );
  }

  const matched = new Set(matchedPairIds);
  const remainingPairs = pairs.filter((pair) => !matched.has(pair.id));
  const remainingRights = shuffledRights.filter((choice) => !matched.has(choice.pairId));
  const selectedPair = pairs.find((pair) => pair.id === selectedPairId) ?? null;
  const chooseLeft = (pair: GroundedMatchingPair) => {
    setSelectedPairId(pair.id);
    setMessage(`Selected ${pair.left}. Now choose its match.`);
    setMessageKind("instruction");
  };

  const chooseRight = (choice: MatchingRightChoice) => {
    if (!selectedPair || matched.has(choice.pairId)) return;

    const isCorrect = selectedPair.id === choice.pairId;
    setFirstAttemptByPair((current) => (
      Object.prototype.hasOwnProperty.call(current, selectedPair.id)
        ? current
        : { ...current, [selectedPair.id]: isCorrect }
    ));

    if (!isCorrect) {
      setMessage(`Not a match: ${selectedPair.left} does not match ${choice.label}. Try another answer.`);
      setMessageKind("incorrect");
      return;
    }

    setMatchedPairIds((current) => (
      current.includes(selectedPair.id) ? current : [...current, selectedPair.id]
    ));
    setSelectedPairId(null);
    setMessage(`Matched: ${selectedPair.left} goes with ${selectedPair.right}.`);
    setMessageKind("correct");
  };

  const toggleSource = (pairId: string) => {
    setOpenSources((current) => {
      const next = new Set(current);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  };

  return (
    <section
      aria-labelledby="match-lab-title"
      className="min-w-0 space-y-4"
    >
      <div>
        <h2 id="match-lab-title" className="font-display text-lg font-semibold text-foreground">
          Match each term
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Pick one term, then pick its match. A missed first try stays in your score, but retrying helps you learn it.
        </p>
      </div>

      <div
        role={messageKind === "incorrect" ? "alert" : "status"}
        aria-live={messageKind === "incorrect" ? "assertive" : "polite"}
        aria-atomic="true"
        className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${
          messageKind === "incorrect"
            ? "border-destructive/40 bg-destructive/10 text-foreground"
            : messageKind === "correct"
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border/60 bg-muted/20 text-muted-foreground"
        }`}
      >
        <span className="font-semibold">
          {messageKind === "incorrect" ? "Try again. " : messageKind === "correct" ? "Correct. " : "Next step. "}
        </span>
        {message}
      </div>

      {!allMatched && (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2" aria-labelledby="match-terms-heading">
            <h3 id="match-terms-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1. Choose a term
            </h3>
            {remainingPairs.map((pair) => {
              const isSelected = selectedPairId === pair.id;
              return (
                <button
                  key={pair.id}
                  ref={(node) => {
                    if (node) leftButtonRefs.current.set(pair.id, node);
                    else leftButtonRefs.current.delete(pair.id);
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => chooseLeft(pair)}
                  className={`min-h-11 w-full break-words rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-card text-foreground hover:border-primary/50"
                  }`}
                >
                  <span>{cleanStudyText(pair.left)}</span>
                  {isSelected && (
                    <span className="mt-1 block text-xs font-semibold text-primary">Selected</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-w-0 space-y-2" aria-labelledby="match-answers-heading">
            <h3 id="match-answers-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              2. Choose its match
            </h3>
            {selectedPair && (
              <p className="sticky top-0 z-10 rounded-xl border border-primary/30 bg-background/95 px-3 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur sm:static sm:shadow-none">
                Match for: <span className="text-primary">{cleanStudyText(selectedPair.left)}</span>
              </p>
            )}
            {!selectedPair && (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Select a term first. Answer choices will then become available.
              </p>
            )}
            {remainingRights.map((choice) => (
              <button
                key={choice.pairId}
                ref={(node) => {
                  if (node) rightButtonRefs.current.set(choice.pairId, node);
                  else rightButtonRefs.current.delete(choice.pairId);
                }}
                type="button"
                disabled={!selectedPair}
                onClick={() => chooseRight(choice)}
                className="min-h-11 w-full break-words rounded-xl border border-border/60 bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cleanStudyText(choice.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {matchedPairIds.length > 0 && (
        <div className="space-y-2" aria-labelledby="matched-pairs-heading">
          <h3 id="matched-pairs-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Matched pairs · {matchedPairIds.length} of {pairs.length}
          </h3>
          {matchedPairIds.map((pairId) => {
            const pair = pairs.find((candidate) => candidate.id === pairId)!;
            const sourceOpen = openSources.has(pairId);
            const firstTry = firstAttemptByPair[pairId] === true;
            const sourceRegionId = `matching-source-${pairs.findIndex((candidate) => candidate.id === pairId)}`;
            return (
              <article key={pair.id} className="min-w-0 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="break-words text-sm font-medium text-foreground">
                  <span aria-hidden="true">✓ </span>
                  <span className="sr-only">Matched: </span>
                  {cleanStudyText(pair.left)} — {cleanStudyText(pair.right)}
                </p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {firstTry ? "Matched on the first try" : "Recovered after a retry"}
                </p>
                {pair.sourceExcerpt && (
                  <>
                    <button
                      type="button"
                      aria-expanded={sourceOpen}
                      aria-controls={sourceRegionId}
                      onClick={() => toggleSource(pair.id)}
                      className="mt-2 min-h-11 rounded-lg px-2 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {sourceOpen ? "Hide source" : `Review source for ${pair.conceptName}`}
                    </button>
                    {sourceOpen && (
                      <blockquote
                        id={sourceRegionId}
                        className="mt-1 break-words border-l-2 border-primary/30 pl-3 text-xs leading-relaxed text-muted-foreground"
                      >
                        From your class material: “{pair.sourceExcerpt}”
                      </blockquote>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {allMatched && (
        <div
          ref={completionRef}
          className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          <p className="font-semibold text-foreground">All pairs matched</p>
          <p className="mt-1 text-sm text-muted-foreground">
            First-try recall: {pairs.filter((pair) => firstAttemptByPair[pair.id] === true).length} of {pairs.length}
          </p>
        </div>
      )}
    </section>
  );
}
