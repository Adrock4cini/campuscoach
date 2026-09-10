import type { LearningArtifact } from "@/lib/learningArtifacts/types";
import { cleanStudyText, retrievalPrompt } from "@/lib/study/studyText";

interface Props {
  artifact: LearningArtifact<"flashcards"> | LearningArtifact<"multiple_choice">;
  /** Exact item positions that missed their first try in the frozen session. */
  missedItemIndices: number[];
}

/** Read-only review of the saved run. Opening answers never records practice. */
export function StudyMissReview({ artifact, missedItemIndices }: Props) {
  const reviews = [...new Set(missedItemIndices)].flatMap((index) => {
    if (artifact.kind === "flashcards") {
      const card = artifact.payload.cards[index];
      return card ? [{
        index,
        prompt: retrievalPrompt(card.front, card.conceptName),
        answer: cleanStudyText(card.back),
        explanation: "",
        source: card.sourceExcerpt,
      }] : [];
    }
    const question = artifact.payload.questions[index];
    return question ? [{
      index,
      prompt: cleanStudyText(question.prompt),
      answer: cleanStudyText(question.choices[question.answerIndex]),
      explanation: cleanStudyText(question.rationale),
      source: question.sourceExcerpt,
    }] : [];
  });

  return (
    <section
      aria-label="Review missed questions"
      data-feature="study-miss-review-v1"
      className="min-w-0 space-y-3 border-t border-border/50 pt-4 text-left"
    >
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to review from this round. Try a fresh set later to check what sticks.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              {reviews.length} {reviews.length === 1 ? "question" : "questions"} to revisit
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {artifact.kind === "flashcards"
                ? "These are the cards you marked for review."
                : "These are the questions you missed on the first try."}
              {" "}Review the answers before your next practice. Your first-try score stays the same.
            </p>
          </div>
          <ol className="space-y-3">
            {reviews.map((review) => (
              <li key={review.index} className="min-w-0 space-y-3 rounded-2xl border border-border/60 p-4">
                <p className="break-words text-sm font-medium leading-relaxed text-foreground">
                  {review.prompt}
                </p>
                <div className="min-w-0 space-y-1 rounded-xl bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary">Correct answer</p>
                  <p className="break-words text-sm leading-relaxed text-foreground">{review.answer}</p>
                </div>
                {review.explanation && (
                  <p className="break-words text-sm leading-relaxed text-muted-foreground">{review.explanation}</p>
                )}
                {review.source && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer rounded-lg py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Check your source
                    </summary>
                    <p className="break-words border-t border-border/40 pt-2 leading-relaxed">
                      {cleanStudyText(review.source)}
                    </p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
