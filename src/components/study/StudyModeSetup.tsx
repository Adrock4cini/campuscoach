import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classes } from "@/data/demo";
import { getTopicsForClass, StudyMode, modeLabels } from "@/data/questions";
import { ArrowRight, Brain, Target, Sparkles, Zap, Gamepad2, Trophy } from "lucide-react";

const modeIcons: Record<StudyMode, React.ElementType> = {
  "flashcards": Brain,
  "multiple-choice": Target,
  "fill-blank": Sparkles,
  "true-false": Zap,
  "matching": Gamepad2,
  "timed-challenge": Trophy,
};

interface Props {
  mode: StudyMode;
  onStart: (config: { classId: string; topic: string; difficulty: "easy" | "medium" | "hard" | "mixed"; count: number; duration?: number }) => void;
  onBack: () => void;
  defaultClassId?: string;
  defaultTopic?: string;
}

export default function StudyModeSetup({ mode, onStart, onBack, defaultClassId, defaultTopic }: Props) {
  const [classId, setClassId] = useState<string>(defaultClassId || classes[0].id);
  const [topic, setTopic] = useState<string>(defaultTopic || "all");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(60);

  const topics = getTopicsForClass(classId);
  const Icon = modeIcons[mode];
  const isTimed = mode === "timed-challenge";
  const isMatching = mode === "matching";

  const counts = isMatching ? [1] : [5, 10, 15];
  const durations = [60, 120, 180];

  const selectedClass = classes.find(c => c.id === classId);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-5">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Back to Study Lab
      </button>

      <div className="text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-semibold text-foreground">{modeLabels[mode]}</h1>
        <p className="text-muted-foreground text-sm mt-1">Focused on what matters most</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-5 space-y-5">
          {/* Class selection */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Choose a class</label>
            <div className="flex flex-wrap gap-2">
              {classes.map(c => (
                <Badge
                  key={c.id}
                  variant="outline"
                  className={`cursor-pointer transition-all ${classId === c.id ? "bg-primary/10 text-primary border-primary ring-1 ring-primary" : "hover:bg-muted"}`}
                  onClick={() => { setClassId(c.id); setTopic("all"); }}
                >
                  {c.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Topic</label>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={`cursor-pointer transition-all ${topic === "all" ? "bg-primary/10 text-primary border-primary ring-1 ring-primary" : "hover:bg-muted"}`}
                onClick={() => setTopic("all")}
              >
                All Topics
              </Badge>
              {topics.map(t => (
                <Badge
                  key={t}
                  variant="outline"
                  className={`cursor-pointer transition-all ${topic === t ? "bg-primary/10 text-primary border-primary ring-1 ring-primary" : "hover:bg-muted"}`}
                  onClick={() => setTopic(t)}
                >
                  {t}
                </Badge>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Difficulty</label>
            <div className="flex flex-wrap gap-2">
              {(["mixed", "easy", "medium", "hard"] as const).map(d => (
                <Badge
                  key={d}
                  variant="outline"
                  className={`cursor-pointer capitalize transition-all ${difficulty === d ? "bg-primary/10 text-primary border-primary ring-1 ring-primary" : "hover:bg-muted"}`}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </Badge>
              ))}
            </div>
          </div>

          {/* Count or Duration */}
          {isTimed ? (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Challenge Duration</label>
              <div className="flex gap-2">
                {durations.map(d => (
                  <Badge
                    key={d}
                    variant="secondary"
                    className={`cursor-pointer transition-all ${duration === d ? "bg-primary/10 text-primary ring-1 ring-primary" : "hover:bg-primary/10"}`}
                    onClick={() => setDuration(d)}
                  >
                    {d === 60 ? "1 min" : d === 120 ? "2 min" : "3 min"}
                  </Badge>
                ))}
              </div>
            </div>
          ) : !isMatching ? (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Questions</label>
              <div className="flex gap-2">
                {counts.map(c => (
                  <Badge
                    key={c}
                    variant="secondary"
                    className={`cursor-pointer transition-all ${count === c ? "bg-primary/10 text-primary ring-1 ring-primary" : "hover:bg-primary/10"}`}
                    onClick={() => setCount(c)}
                  >
                    {c} questions
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            className="w-full bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
            onClick={() => onStart({ classId, topic, difficulty, count: isMatching ? 1 : count, duration: isTimed ? duration : undefined })}
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            Start {modeLabels[mode]}
          </Button>
        </CardContent>
      </Card>

      {selectedClass && (
        <p className="text-xs text-center text-muted-foreground">
          Current readiness for {selectedClass.name}: <span className="font-medium text-foreground">{selectedClass.readiness}%</span>
        </p>
      )}
    </motion.div>
  );
}
