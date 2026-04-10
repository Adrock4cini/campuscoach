import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StudyQuestion } from "@/data/questions";
import { RotateCw, ThumbsUp, ThumbsDown, SkipForward } from "lucide-react";

interface Props {
  question: StudyQuestion;
  onAnswer: (correct: boolean | null) => void;
}

export default function FlashcardView({ question, onAnswer }: Props) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="space-y-4">
      <div className="perspective-1000 cursor-pointer" onClick={() => setFlipped(!flipped)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={flipped ? "back" : "front"}
            initial={{ rotateY: flipped ? -90 : 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: flipped ? 90 : -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="shadow-card min-h-[240px] flex items-center justify-center">
              <CardContent className="p-8 text-center">
                {!flipped ? (
                  <>
                    <p className="text-lg font-medium text-foreground leading-relaxed">{question.prompt}</p>
                    <p className="text-xs text-muted-foreground mt-4">Tap to flip</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium text-foreground leading-relaxed">{question.answer}</p>
                    <p className="text-xs text-muted-foreground mt-3">{question.explanation}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {!flipped ? (
        <div className="flex justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setFlipped(true)}>
            <RotateCw className="h-4 w-4 mr-1.5" />
            Flip
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setFlipped(false); onAnswer(null); }}>
            <SkipForward className="h-4 w-4 mr-1.5" />
            Skip
          </Button>
        </div>
      ) : (
        <div className="flex justify-center gap-3">
          <Button
            size="sm"
            className="bg-success/10 text-success hover:bg-success/20 border border-success/20"
            onClick={() => { setFlipped(false); onAnswer(true); }}
          >
            <ThumbsUp className="h-4 w-4 mr-1.5" />
            I knew this
          </Button>
          <Button
            size="sm"
            className="bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20"
            onClick={() => { setFlipped(false); onAnswer(false); }}
          >
            <ThumbsDown className="h-4 w-4 mr-1.5" />
            Needs work
          </Button>
        </div>
      )}
    </div>
  );
}
