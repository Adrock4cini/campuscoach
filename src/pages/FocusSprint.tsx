import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { classes } from "@/data/demo";
import { ArrowLeft, Play, Pause, RotateCcw, Trophy } from "lucide-react";

export default function FocusSprint() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const classId = searchParams.get("classId") || classes[0].id;
  const duration = parseInt(searchParams.get("duration") || "25");
  const cls = classes.find(c => c.id === classId) || classes[0];

  const totalSeconds = duration * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running || finished) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, finished]);

  const elapsed = totalSeconds - secondsLeft;
  const progress = (elapsed / totalSeconds) * 100;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const reset = () => {
    setSecondsLeft(totalSeconds);
    setRunning(false);
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="h-20 w-20 rounded-full bg-gradient-calm flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-semibold text-foreground mb-2">Great work! 🎉</h1>
          <p className="text-muted-foreground">You completed a {duration}-minute Focus Sprint on <strong>{cls.name}</strong>.</p>
        </motion.div>

        <Card className="shadow-card">
          <CardContent className="p-5 space-y-3">
            <h3 className="font-display font-semibold text-foreground">Session Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{duration}</p>
                <p className="text-xs text-muted-foreground">Minutes studied</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-success">+3%</p>
                <p className="text-xs text-muted-foreground">Readiness boost</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Every session counts. You're building momentum! 🔥
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={reset}>Do Another Sprint</Button>
          <Button className="flex-1 bg-gradient-calm border-0 text-primary-foreground" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/study-lab")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Focus Sprint</h1>
          <p className="text-muted-foreground text-sm">{cls.name} · {duration} minutes</p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-elevated">
          <CardContent className="p-8 text-center">
            {/* Timer display */}
            <div className="mb-6">
              <p className="text-7xl font-display font-bold text-foreground tabular-nums">
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {running ? "Stay focused. You've got this." : "Ready when you are."}
              </p>
            </div>

            <Progress value={progress} className="h-2 mb-6" />

            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                className={running ? "bg-warning text-warning-foreground hover:bg-warning/90" : "bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"}
                onClick={() => setRunning(!running)}
              >
                {running ? <><Pause className="h-5 w-5 mr-2" /> Pause</> : <><Play className="h-5 w-5 mr-2" /> {elapsed > 0 ? "Resume" : "Start"}</>}
              </Button>
              {elapsed > 0 && !running && (
                <Button variant="outline" size="lg" onClick={reset}>
                  <RotateCcw className="h-5 w-5 mr-2" /> Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card className="shadow-soft bg-primary/5 border-primary/20">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Tip: Put your phone face-down and close other tabs. You'll be amazed what {duration} focused minutes can do.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
