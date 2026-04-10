import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudyQuestion } from "@/data/questions";
import AnswerFeedback from "./AnswerFeedback";
import { Eye, SkipForward } from "lucide-react";

interface Props {
  question: StudyQuestion;
  onAnswer: (correct: boolean | null) => void;
  onNext: () => void;
  isLast: boolean;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export default function FillBlankView({ question, onAnswer, onNext, isLast }: Props) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const correctNorm = normalize(question.answer as string);
  const isCorrect = normalize(input) === correctNorm ||
    (correctNorm.length > 3 && normalize(input).includes(correctNorm)) ||
    (correctNorm.length > 3 && correctNorm.includes(normalize(input)) && normalize(input).length >= correctNorm.length - 2);

  const handleSubmit = () => {
    if (!input.trim()) return;
    setSubmitted(true);
    onAnswer(isCorrect);
  };

  const handleSkip = () => {
    setSubmitted(true);
    onAnswer(null);
  };

  const handleNext = () => {
    setInput("");
    setSubmitted(false);
    setShowHint(false);
    onNext();
  };

  const hint = (question.answer as string).charAt(0) + "..." + (question.answer as string).slice(-1);

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardContent className="p-6">
          <p className="text-lg font-medium text-foreground leading-relaxed">{question.prompt}</p>
          {showHint && !submitted && (
            <p className="text-xs text-muted-foreground mt-2">Hint: starts with "{hint}"</p>
          )}
        </CardContent>
      </Card>

      {!submitted ? (
        <>
          <Input
            placeholder="Type your answer..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            className="text-base"
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!input.trim()} className="flex-1 bg-gradient-calm border-0 text-primary-foreground">
              Submit
            </Button>
            {!showHint && (
              <Button variant="outline" size="icon" onClick={() => setShowHint(true)}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleSkip}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </>
      ) : (
        <AnswerFeedback
          correct={isCorrect ? true : input.trim() ? false : null}
          correctAnswer={question.answer as string}
          explanation={question.explanation}
          onNext={handleNext}
          nextLabel={isLast ? "See Results" : "Next Question"}
        />
      )}
    </div>
  );
}
