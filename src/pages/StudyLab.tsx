import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StudyMode } from "@/data/questions";
import { useStudyFormatRecommendation } from "@/lib/intelligence";
import { useAuth } from "@/contexts/AuthContext";
import { RealStudySet } from "@/components/study/RealStudySet";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import {
  Brain, Zap, Target, Gamepad2, Clock,
  ArrowRight, Sparkles, Trophy
} from "lucide-react";

const secondaryModes: { icon: React.ElementType; label: string; mode: StudyMode }[] = [
  { icon: Brain, label: "Flashcards", mode: "flashcards" },
  { icon: Sparkles, label: "Fill blank", mode: "fill-blank" },
  { icon: Zap, label: "True / False", mode: "true-false" },
  { icon: Gamepad2, label: "Matching", mode: "matching" },
  { icon: Trophy, label: "Timed", mode: "timed-challenge" },
  { icon: Target, label: "Multiple choice", mode: "multiple-choice" },
];

const durations = [15, 25, 45];

export default function StudyLab() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { mode: authMode } = useAuth();
  const isRealUser = authMode === "real";
  const { classes: availableClasses, loading: classesLoading } = useMyClasses();

  const preselectedClass = searchParams.get("classId");
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [selectedClass, setSelectedClass] = useState<string>(preselectedClass || "");
  const effectiveClass = selectedClass || availableClasses[0]?.id || "";
  // Study-format recommendation comes from the Intelligence Engine,
  // which also picks the topic to attack based on peer signal.
  const recommendation = useStudyFormatRecommendation(effectiveClass);
  const recommendedTopic = recommendation.topic;

  const startRecommended = () =>
    navigate(`/study-lab/session?mode=${recommendation.mode}&classId=${effectiveClass}&topic=${encodeURIComponent(recommendedTopic ?? "all")}`);

  const startSecondary = (mode: StudyMode) =>
    navigate(`/study-lab/session?mode=${mode}&classId=${effectiveClass}&topic=${encodeURIComponent(recommendedTopic ?? "all")}`);


  return (
    <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1.5">
          <Sparkles className="h-3 w-3" /> Study Lab
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">
          What do you want to study?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a class, then focus on what matters right now.
        </p>
      </div>

      {/* Class chips */}
      <div className="flex flex-wrap gap-2">
        {availableClasses.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedClass(c.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              effectiveClass === c.id
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Real users: concept-backed study set (flashcards / MCQ). */}
      {isRealUser && classesLoading && (
        <p className="text-sm text-muted-foreground">Loading your classes…</p>
      )}
      {isRealUser && !classesLoading && !effectiveClass && (
        <Card className="border-dashed border-border/50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-foreground">Add a class before starting a study session.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/classes")}>Go to classes</Button>
          </CardContent>
        </Card>
      )}
      {isRealUser && effectiveClass && <RealStudySet classId={effectiveClass} />}



      {/* HERO: single recommended action */}
      {!isRealUser && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-elevated border-primary/30 overflow-hidden">
          <CardContent className="p-8 text-center space-y-5">
            <Badge variant="outline" className="border-primary/30 text-primary text-[10px] uppercase tracking-wider">
              🔥 Highest exam impact
            </Badge>
            <div className="space-y-1.5">
              <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground">
                {recommendation.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {recommendedTopic ?? "Recommended topic"} · ~{recommendation.suggestedMinutes} min
              </p>

            </div>
            <Button
              size="lg"
              className="bg-gradient-calm border-0 text-primary-foreground hover:opacity-95 rounded-full px-8"
              onClick={startRecommended}
            >
              Start
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>}

      {/* Secondary modes */}
      {!isRealUser && <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Or try</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {secondaryModes
            .filter(m => m.mode !== recommendation.mode)
            .map(mode => (
              <button
                key={mode.mode}
                onClick={() => startSecondary(mode.mode)}
                className="group flex items-center gap-2 px-3 py-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
              >
                <mode.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                <span className="text-sm text-foreground">{mode.label}</span>
              </button>
            ))}
        </div>
      </div>}

      {/* Focus sprint — minimal */}
      {!isRealUser && <div className="rounded-2xl border border-border/40 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Focus sprint</span>
          </div>
          <div className="flex items-center gap-1.5">
            {durations.map(d => (
              <button
                key={d}
                onClick={() => setSelectedDuration(d)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  selectedDuration === d ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}m
              </button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-1"
              onClick={() => navigate(`/focus-sprint?classId=${effectiveClass}&duration=${selectedDuration}`)}
            >
              Start <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
