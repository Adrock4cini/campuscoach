import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { classes } from "@/data/demo";
import { ArrowLeft, Play, Pause, RotateCcw, Trophy } from "lucide-react";

export default function FocusSprint() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const classId = searchParams.get("classId") || classes[0].id;
  const duration = parseInt(searchParams.get("duration") || "25");
  const cls = classes.find((c) => c.id === classId) || classes[0];

  const totalSeconds = duration * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running || finished) return;
    const id = setInterval(() => {
      setSecondsLeft((p) => {
        if (p <= 1) { setRunning(false); setFinished(true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, finished]);

  const elapsed = totalSeconds - secondsLeft;
  const progress = (elapsed / totalSeconds) * 100;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const reset = () => { setSecondsLeft(totalSeconds); setRunning(false); setFinished(false); };

  // Big ring math
  const size = 320, stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c - (progress / 100) * c;

  if (finished) {
    return (
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="h-20 w-20 rounded-full btn-glow flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-semibold text-foreground mb-2">Great work! 🎉</h1>
          <p className="text-muted-foreground">You completed a {duration}-minute Focus Sprint on <strong>{cls.name}</strong>.</p>
        </motion.div>

        <Card className="shadow-card">
          <CardContent className="p-6 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-3xl font-display font-bold text-primary">{duration}</p>
                <p className="text-xs text-muted-foreground mt-1">Minutes studied</p>
              </div>
              <div>
                <p className="text-3xl font-display font-bold text-success">+3%</p>
                <p className="text-xs text-muted-foreground mt-1">Readiness boost</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={reset}>Another sprint</Button>
          <Button className="flex-1 h-12 rounded-2xl btn-glow border-0" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative -m-4 md:-m-6 lg:-m-10 min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Immersive deep red-purple aurora */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_0%,hsl(330_85%_30%/0.5),transparent_60%),radial-gradient(70%_60%_at_85%_20%,hsl(280_80%_30%/0.55),transparent_60%),radial-gradient(60%_70%_at_50%_100%,hsl(350_80%_25%/0.45),transparent_60%)]" />
        <div className="absolute inset-0 bg-[hsl(280_40%_5%)]/40" />
        <motion.div
          className="absolute top-1/4 -left-20 h-[420px] w-[420px] rounded-full bg-[hsl(330_90%_50%)]/25 blur-[140px]"
          animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-24 h-[460px] w-[460px] rounded-full bg-[hsl(280_90%_55%)]/25 blur-[150px]"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-6 py-8 flex flex-col items-center">
        <div className="w-full flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/study-lab")} className="text-foreground/80">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-display font-semibold text-foreground">Grind Mode</h1>
            <p className="text-xs text-foreground/60">{cls.name} · {duration} min</p>
          </div>
        </div>

        {/* Pulsing ring timer */}
        <div className="relative" style={{ width: size, height: size }}>
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(330 90% 55% / 0.45), transparent 65%)", filter: "blur(40px)" }}
            animate={{ scale: running ? [1, 1.08, 1] : 1, opacity: running ? [0.7, 1, 0.7] : 0.5 }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <svg width={size} height={size} className="relative -rotate-90">
            <defs>
              <linearGradient id="grind-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(330 95% 65%)" />
                <stop offset="100%" stopColor="hsl(280 95% 70%)" />
              </linearGradient>
            </defs>
            <circle cx={size/2} cy={size/2} r={r} stroke="hsl(0 0% 100% / 0.08)" strokeWidth={stroke} fill="none" />
            <motion.circle
              cx={size/2} cy={size/2} r={r}
              stroke="url(#grind-grad)" strokeWidth={stroke} strokeLinecap="round" fill="none"
              strokeDasharray={c}
              animate={{ strokeDashoffset: dash }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ filter: "drop-shadow(0 0 18px hsl(330 90% 60% / 0.7))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-7xl font-semibold tabular-nums text-foreground">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </p>
            <p className="text-xs uppercase tracking-[0.25em] text-foreground/60 mt-3">
              {running ? "Stay locked in" : "Ready when you are"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-10">
          <button
            onClick={() => setRunning(!running)}
            className="h-14 px-8 rounded-2xl text-base font-medium btn-glow-magenta inline-flex items-center gap-2"
          >
            {running ? <><Pause className="h-5 w-5" /> Pause</> : <><Play className="h-5 w-5" /> {elapsed > 0 ? "Resume" : "Start"}</>}
          </button>
          {elapsed > 0 && !running && (
            <Button variant="outline" size="lg" onClick={reset} className="h-14 rounded-2xl border-border/40 bg-background/30 backdrop-blur">
              <RotateCcw className="h-5 w-5 mr-2" /> Reset
            </Button>
          )}
        </div>

        <p className="text-xs text-foreground/50 text-center mt-10 max-w-sm">
          💡 Phone face-down. Close other tabs. {duration} minutes of pure focus.
        </p>
      </div>
    </div>
  );
}
