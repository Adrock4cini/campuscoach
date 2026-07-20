import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StudyQuestion } from "@/data/questions";
import { CheckCircle2 } from "lucide-react";

interface Props {
  question: StudyQuestion;
  onComplete: (correct: number, total: number) => void;
}

export default function MatchingView({ question, onComplete }: Props) {
  const pairs = useMemo(() => question.matchPairs ?? [], [question.matchPairs]);
  const total = pairs.length;

  const shuffledDefs = useMemo(
    () => [...pairs].sort(() => Math.random() - 0.5),
    [pairs]
  );

  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [selectedDef, setSelectedDef] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ term: number; def: number } | null>(null);
  const [attempts, setAttempts] = useState(0);

  const tryMatch = (termIdx: number, defIdx: number) => {
    setAttempts(a => a + 1);
    const termText = pairs[termIdx].term;
    const defText = shuffledDefs[defIdx].definition;
    const pair = pairs.find(p => p.term === termText && p.definition === defText);

    if (pair) {
      const newMatched = new Set(matched);
      newMatched.add(termIdx);
      setMatched(newMatched);
      setSelectedTerm(null);
      setSelectedDef(null);
      if (newMatched.size === total) {
        const accuracy = Math.round((total / attempts) * 100);
        setTimeout(() => onComplete(Math.min(total, Math.round(total * accuracy / 100)), total), 500);
      }
    } else {
      setWrongFlash({ term: termIdx, def: defIdx });
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedTerm(null);
        setSelectedDef(null);
      }, 600);
    }
  };

  const handleTermClick = (idx: number) => {
    if (matched.has(idx)) return;
    setSelectedTerm(idx);
    if (selectedDef !== null) tryMatch(idx, selectedDef);
  };

  const handleDefClick = (idx: number) => {
    const defMatched = pairs.some((p, pi) => matched.has(pi) && p.definition === shuffledDefs[idx].definition);
    if (defMatched) return;
    setSelectedDef(idx);
    if (selectedTerm !== null) tryMatch(selectedTerm, idx);
  };

  const allMatched = matched.size === total;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">Tap a term, then tap its matching definition</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Terms */}
        <div className="space-y-2">
          {pairs.map((p, i) => {
            const isMatched = matched.has(i);
            const isSelected = selectedTerm === i;
            const isWrong = wrongFlash?.term === i;

            return (
              <motion.button
                key={`t-${i}`}
                animate={isWrong ? { x: [0, -4, 4, -4, 0] } : {}}
                transition={{ duration: 0.3 }}
                onClick={() => handleTermClick(i)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-all ${
                  isMatched
                    ? "bg-success/10 border border-success/30 text-success"
                    : isWrong
                    ? "bg-danger/10 border border-danger/30"
                    : isSelected
                    ? "bg-primary/10 border border-primary ring-1 ring-primary text-foreground"
                    : "bg-card border border-border hover:border-primary/30 text-foreground"
                }`}
                disabled={isMatched}
              >
                {isMatched && <CheckCircle2 className="h-3 w-3 inline mr-1.5 text-success" />}
                {p.term}
              </motion.button>
            );
          })}
        </div>

        {/* Definitions */}
        <div className="space-y-2">
          {shuffledDefs.map((d, i) => {
            const defMatchedIdx = pairs.findIndex(p => p.definition === d.definition);
            const isMatched = matched.has(defMatchedIdx);
            const isSelected = selectedDef === i;
            const isWrong = wrongFlash?.def === i;

            return (
              <motion.button
                key={`d-${i}`}
                animate={isWrong ? { x: [0, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.3 }}
                onClick={() => handleDefClick(i)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-all ${
                  isMatched
                    ? "bg-success/10 border border-success/30 text-success"
                    : isWrong
                    ? "bg-danger/10 border border-danger/30"
                    : isSelected
                    ? "bg-primary/10 border border-primary ring-1 ring-primary text-foreground"
                    : "bg-card border border-border hover:border-primary/30 text-foreground"
                }`}
                disabled={isMatched}
              >
                {isMatched && <CheckCircle2 className="h-3 w-3 inline mr-1.5 text-success" />}
                {d.definition}
              </motion.button>
            );
          })}
        </div>
      </div>

      {allMatched && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <p className="text-sm text-success font-medium mb-1">All pairs matched! 🎉</p>
          <p className="text-xs text-muted-foreground">{attempts} attempts for {total} pairs</p>
        </motion.div>
      )}
    </div>
  );
}
