import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getDaysUntil, getReadinessColor } from "@/data/demo";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useAuth } from "@/contexts/AuthContext";
import { MapPin, Clock, User, BookOpen, CheckCircle2, Circle, Loader2, Sparkles, Map, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";

export default function MyClasses() {
  const { classes, isReal, loading, error, reload } = useMyClasses();
  const { user, isDemoMode } = useAuth();
  const realMode = !!user && !isDemoMode;
  const navigate = useNavigate();

  if (realMode && !loading && error) {
    return (
      <div className="max-w-3xl mx-auto pt-8">
        <ClassesLoadError onRetry={() => void reload()} />
      </div>
    );
  }

  if (realMode && !loading && classes.length === 0) {
    return (
      <div className="max-w-3xl mx-auto pt-8">
        <Card className="shadow-card border-dashed">
          <CardContent className="p-10 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-gradient-calm flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-semibold text-foreground">Set up your semester</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Add your real classes to unlock captures, assignments, exams, and study sessions built from your actual coursework.
              </p>
            </div>
            <div className="pt-2">
              <Button onClick={() => navigate("/onboarding")}>Add your first class</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">My Classes</h1>
        <Link
          to="/path-to-graduation"
          aria-label="Degree path preview"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          <Map className="h-4 w-4 text-primary" />
          <span>Degree path</span>
          <Badge variant="outline" className="hidden px-1.5 py-0 text-[9px] uppercase tracking-wider sm:inline-flex">
            Preview
          </Badge>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {classes.map((c, i) => {
          const hasProfessor = Boolean(c.professor && c.professor !== "TBD");
          const hasSchedule = c.days.length > 0 || Boolean(c.time);
          const hasLocation = Boolean(c.location);
          const hasCurrentTopic = Boolean(c.currentTopic && c.currentTopic !== "Getting started");

          return (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Link to={`/classes/${c.id}`} aria-label={`Open ${c.name}`} className="block h-full">
              <Card className="group h-full cursor-pointer overflow-hidden rounded-[26px] border-border/50 bg-card/70 shadow-card backdrop-blur-md transition-all hover:border-border/80 hover:shadow-elevated">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-semibold text-primary-foreground shadow-sm ${c.color}`}>
                      {c.name.trim().charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-lg font-semibold leading-tight text-foreground">{c.name}</h3>
                      {hasProfessor && (
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" />
                          {c.professor}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`block text-sm font-bold tabular-nums ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
                      <span className="block text-[10px] text-muted-foreground">ready</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>

                  {(hasSchedule || hasLocation || hasCurrentTopic) && (
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      {hasSchedule && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span>{[c.days.join("/"), c.time].filter(Boolean).join(" · ")}</span>
                        </div>
                      )}
                      {hasLocation && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /><span>{c.location}</span></div>}
                      {hasCurrentTopic && <div className="flex min-w-0 items-center gap-1.5"><BookOpen className="h-3 w-3 shrink-0" /><span className="truncate">{c.currentTopic}</span></div>}
                    </div>
                  )}

                  {c.nextExamDate && (
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-danger/10 text-xs text-danger">
                        Exam in {getDaysUntil(c.nextExamDate)} days
                      </Badge>
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl bg-background/35 px-3 py-3">
                    <Progress value={c.readiness} className="h-1.5" />
                  </div>

                  {c.chapters.length > 0 && (
                    <div className="mt-3 flex items-center gap-1.5">
                      {c.chapters.map(ch => (
                        <div key={ch.number} title={`Ch ${ch.number}: ${ch.title}`}>
                          {ch.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-success" /> :
                           ch.status === 'in-progress' ? <Loader2 className="h-4 w-4 text-warning" /> :
                           <Circle className="h-4 w-4 text-muted-foreground/30" />}
                        </div>
                      ))}
                      <span className="ml-1 text-xs text-muted-foreground">chapters</span>
                    </div>
                  )}

                  <div className="mt-4 flex items-start gap-2 border-t border-border/40 pt-3 text-xs font-medium text-primary">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{c.suggestedAction}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
          );
        })}
      </div>

      <Button variant="outline" className="h-12 w-full rounded-2xl border-dashed" onClick={() => navigate("/onboarding")}>
        <Plus className="h-4 w-4" />
        Add class
      </Button>
    </div>
  );
}
