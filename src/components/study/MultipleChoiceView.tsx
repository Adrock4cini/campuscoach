import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StudyQuestion } from "@/data/questions";
import AnswerFeedback from "./AnswerFeedback";

interface Props {
  question: StudyQuestion;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
  isLast: boolean;
}

export default function MultipleChoiceView({ question, onAnswer, onNext, isLast }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = selected === question.answer;

  const handleSubmit = () => {
    if (!selected) return;
    setSubmitted(true);
    onAnswer(isCorrect);
  };

  const handleNext = () => {
    setSelected(null);
    setSubmitted(false);
    onNext();
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardContent className="p-6">
          <p className="text-lg font-medium text-foreground leading-relaxed">{question.prompt}</p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {question.choices?.map((choice, i) => {
          let classes = "w-full text-left p-4 rounded-xl border transition-all text-sm ";
          if (submitted) {
            if (choice === question.answer) classes += "bg-success/10 border-success/30 text-foreground";
            else if (choice === selected) classes += "bg-danger/10 border-danger/30 text-foreground";
            else classes += "bg-card border-border text-muted-foreground";
          } else {
            classes += selected === choice
              ? "bg-primary/10 border-primary ring-1 ring-primary text-foreground"
              : "bg-card border-border hover:border-primary/30 hover:bg-muted/30 text-foreground";
          }

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={classes}
              onClick={() => !submitted && setSelected(choice)}
              disabled={submitted}
            >
              <span className="text-xs text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
              {choice}
            </motion.button>
          );
        })}
      </div>

      {!submitted ? (
        <Button
          onClick={handleSubmit}
          disabled={!selected}
          className="w-full bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
        >
          Submit Answer
        </Button>
      ) : (
        <AnswerFeedback
          correct={isCorrect}
          correctAnswer={question.answer as string}
          explanation={question.explanation}
          onNext={handleNext}
          nextLabel={isLast ? "See Results" : "Next Question"}
        />
      )}
    </div>
  );
}
