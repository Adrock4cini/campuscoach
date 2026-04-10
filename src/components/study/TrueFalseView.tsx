import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { StudyQuestion } from "@/data/questions";
import AnswerFeedback from "./AnswerFeedback";
import { Flame } from "lucide-react";

interface Props {
  question: StudyQuestion;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
  isLast: boolean;
  streak?: number;
}

export default function TrueFalseView({ question, onAnswer, onNext, isLast, streak = 0 }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const isCorrect = chosen === question.answer;

  const handleChoice = (val: "true" | "false") => {
    setChosen(val);
    setSubmitted(true);
    onAnswer(val === question.answer);
  };

  const handleNext = () => {
    setSubmitted(false);
    setChosen(null);
    onNext();
  };

  return (
    <div className="space-y-4">
      {streak >= 3 && (
        <div className="flex items-center justify-center gap-1.5 text-warning">
          <Flame className="h-4 w-4" />
          <span className="text-xs font-medium">{streak} streak!</span>
        </div>
      )}

      <Card className="shadow-card">
        <CardContent className="p-6">
          <p className="text-lg font-medium text-foreground leading-relaxed text-center">{question.prompt}</p>
        </CardContent>
      </Card>

      {!submitted ? (
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => handleChoice("true")}
            className="p-5 rounded-xl border-2 border-success/20 bg-success/5 hover:bg-success/10 transition-colors text-center"
          >
            <span className="text-lg font-semibold text-success">True</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => handleChoice("false")}
            className="p-5 rounded-xl border-2 border-danger/20 bg-danger/5 hover:bg-danger/10 transition-colors text-center"
          >
            <span className="text-lg font-semibold text-danger">False</span>
          </motion.button>
        </div>
      ) : (
        <AnswerFeedback
          correct={isCorrect}
          correctAnswer={question.answer === "true" ? "True" : "False"}
          explanation={question.explanation}
          onNext={handleNext}
          nextLabel={isLast ? "See Results" : "Next"}
        />
      )}
    </div>
  );
}
