import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { classes } from "@/data/demo";
import { modeLabels, StudyMode } from "@/data/questions";
import { Trophy, RotateCcw, ArrowRight, Sparkles, TrendingUp, Wifi } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { contributeStudySignal } from "@/hooks/useClassIntelligence";
import { toast } from "sonner";

interface Props {
  classId: string;
  topic: string;
  mode: StudyMode;
  correct: number;
  incorrect: number;
  skipped: number;
  elapsed: number;
  onRetryMissed: () => void;
  onReplay: () => void;
  onSwitchMode: () => void;
  onBackToLab: () => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ResultsSummary({
  classId, topic, mode, correct, incorrect, skipped, elapsed,
  onRetryMissed, onReplay, onSwitchMode, onBackToLab,
}: Props) {
  const [confidence, setConfidence] = useState<string>("");
  const [contributed, setContributed] = useState(false);
  const total = correct + incorrect + skipped;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const cls = classes.find(c => c.id === classId);
  const readinessGain = Math.max(1, Math.round(score / 20));
  const newReadiness = Math.min(100, (cls?.readiness ?? 50) + readinessGain);

  // Auto-contribute the session result to the crowdsourced layer once
  useEffect(() => {
    if (contributed || total === 0 || !classId || !topic || topic === "all") return;
    contributeStudySignal({
      classId,
      topicId: topic,
      topicName: topic,
      starred: score < 60,
      timeSpentMinutes: Math.max(1, Math.round(elapsed / 60)),
      accuracy: score,
      incorrectCount: incorrect,
      sourceType: "study-session",
      sourceId: mode,
    }).then(({ error }) => { if (!error) setContributed(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfidence = async (val: string) => {
    setConfidence(val);
    if (!classId || !topic || topic === "all") return;
    await contributeStudySignal({
      classId, topicId: topic, topicName: topic,
      confidence: Number(val), timeSpentMinutes: 0,
      sourceType: "confidence-checkin",
    });
    toast.success("Saved — your class predictions just got sharper.");
  };

  const encouragement = score >= 90
    ? "Outstanding! You really know this material. 🌟"
    : score >= 70
    ? "Great job! You're building solid understanding. 💪"
    : score >= 50
    ? "Good effort! A few more rounds and you'll have this down. 📚"
    : "Every session counts. You're showing up, and that matters. 🌱";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto space-y-5">
      <div className="text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-semibold text-foreground">Session Complete!</h2>
        <p className="text-muted-foreground text-sm mt-1">{modeLabels[mode]} · {cls?.name}</p>
      </div>

      {/* Score */}
      <Card className="shadow-card">
        <CardContent className="p-5 text-center">
          <div className="text-4xl font-display font-bold text-primary mb-1">{score}%</div>
          <p className="text-sm text-muted-foreground">{correct} correct · {incorrect} incorrect · {skipped} skipped</p>
          <p className="text-xs text-muted-foreground mt-1">Time: {formatTime(elapsed)}</p>
        </CardContent>
      </Card>

      {/* Readiness impact */}
      <Card className="shadow-card border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {cls?.name} readiness: {cls?.readiness}% → {newReadiness}%
            </p>
            <p className="text-xs text-muted-foreground">+{readinessGain}% from this session</p>
          </div>
        </CardContent>
      </Card>

      {/* Encouragement */}
      <Card className="shadow-soft bg-surface-warm">
        <CardContent className="p-4 text-center">
          <Sparkles className="h-5 w-5 text-primary mx-auto mb-2" />
          <p className="text-sm text-foreground">{encouragement}</p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-foreground mb-2">How confident are you now?</p>
          <Select value={confidence} onValueChange={setConfidence}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose your confidence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Still lost</SelectItem>
              <SelectItem value="2">A little better</SelectItem>
              <SelectItem value="3">Getting there</SelectItem>
              <SelectItem value="4">Pretty solid</SelectItem>
              <SelectItem value="5">Ready to use this</SelectItem>
            </SelectContent>
          </Select>
          {confidence && <p className="text-xs text-muted-foreground mt-2">Saved to improve future recommendations.</p>}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        {incorrect > 0 && (
          <Button variant="outline" onClick={onRetryMissed} className="text-sm">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Retry missed
          </Button>
        )}
        <Button variant="outline" onClick={onReplay} className="text-sm">
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Replay
        </Button>
        <Button variant="outline" onClick={onSwitchMode} className="text-sm">
          Switch mode
        </Button>
        <Button onClick={onBackToLab} className="text-sm bg-gradient-calm border-0 text-primary-foreground">
          <ArrowRight className="h-4 w-4 mr-1.5" />
          Study Lab
        </Button>
      </div>
    </motion.div>
  );
}
