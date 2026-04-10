import { motion } from "framer-motion";
import { CheckCircle2, XCircle, SkipForward } from "lucide-react";

interface Props {
  correct: boolean | null;
  correctAnswer: string;
  explanation: string;
  onNext: () => void;
  nextLabel?: string;
}

export default function AnswerFeedback({ correct, correctAnswer, explanation, onNext, nextLabel = "Next" }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 mt-4 ${
        correct === true
          ? "bg-success/10 border border-success/20"
          : correct === false
          ? "bg-danger/10 border border-danger/20"
          : "bg-muted border border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        {correct === true ? (
          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
        ) : correct === false ? (
          <XCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
        ) : (
          <SkipForward className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {correct === true ? "Nice work!" : correct === false ? "Not quite" : "Skipped"}
          </p>
          {correct !== true && (
            <p className="text-sm text-foreground mt-1">
              <span className="text-muted-foreground">Answer: </span>{correctAnswer}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1.5">{explanation}</p>
        </div>
      </div>
      <button
        onClick={onNext}
        className="mt-3 w-full text-sm font-medium text-primary hover:text-primary/80 transition-colors py-1.5"
      >
        {nextLabel} →
      </button>
    </motion.div>
  );
}
