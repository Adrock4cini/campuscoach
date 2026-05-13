import { motion } from "framer-motion";
import { ArrowRight, Flame, Users, CalendarClock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ReadinessRing } from "@/components/ReadinessRing";
import { classes, exams, getDaysUntil } from "@/data/demo";
import { getClassPulse } from "@/data/courseIntelligence";

/**
 * Cinematic dashboard hero — premium glow + glass, summarises the
 * student's academic life in one scannable card.
 */
export function DashboardHero() {
  const navigate = useNavigate();

  // Focus class = lowest readiness with an upcoming exam, fallback lowest readiness
  const focus = [...classes].sort((a, b) => a.readiness - b.readiness)[0];
  const focusExam = exams
    .filter((e) => e.classId === focus.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const examDays = focusExam ? getDaysUntil(focusExam.date) : null;
  const pulse = getClassPulse(focus.id);
  const weakTopic = pulse?.mostStruggled.topic ?? focus.currentTopic;
  const studentCount = pulse?.mostStruggled.studentCount ?? 0;
  const streak = 4;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-border/50 glass shadow-elegant">
      {/* Layered glow */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute -bottom-32 -right-20 h-[420px] w-[420px] rounded-full bg-accent/25 blur-[130px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/0 via-background/30 to-background/60" />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 p-6 md:p-10">
        {/* Left: narrative */}
        <div className="flex flex-col justify-between gap-8 min-w-0">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.24em] text-primary/90 mb-3">
              <Sparkles className="h-3 w-3" />
              Today's Academic Snapshot
            </div>
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-3xl md:text-5xl font-display font-semibold leading-tight tracking-tight text-foreground"
            >
              <span className="text-gradient-aurora">{focus.name}</span>
              <span className="text-foreground/80"> needs your attention.</span>
            </motion.h1>
            <p className="mt-4 text-base md:text-lg text-foreground/70 max-w-xl">
              Next best step — <span className="text-foreground font-medium">Practice {weakTopic} for 15 minutes.</span>
            </p>
          </div>

          {/* Meta strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {examDays !== null && (
              <div className="flex items-center gap-2 text-foreground/80">
                <CalendarClock className="h-4 w-4 text-primary" />
                Next exam <span className="text-foreground font-medium">{examDays}d</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-foreground/80">
              <Flame className="h-4 w-4 text-warning" />
              Streak <span className="text-foreground font-medium">{streak} days</span>
            </div>
            {studentCount > 0 && (
              <div className="flex items-center gap-2 text-foreground/80">
                <Users className="h-4 w-4 text-accent" />
                <span className="text-foreground font-medium">{studentCount}</span> classmates struggled here
              </div>
            )}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => navigate(`/focus-sprint?classId=${focus.id}&duration=15`)}
              className="rounded-full h-12 px-6 bg-gradient-calm border-0 text-primary-foreground shadow-elegant hover:opacity-95"
            >
              Start next best step
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate(`/classes/${focus.id}`)}
              className="rounded-full h-12 px-6 border-border/60 bg-background/30 backdrop-blur"
            >
              Open class
            </Button>
          </div>
        </div>

        {/* Right: readiness ring */}
        <div className="flex items-center justify-center lg:justify-end">
          <ReadinessRing
            value={focus.readiness}
            size={240}
            label="Readiness"
            sublabel={focus.name}
          />
        </div>
      </div>
    </section>
  );
}
