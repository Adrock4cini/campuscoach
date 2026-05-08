import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, Clock, AlertTriangle, TrendingUp, Zap, Flame,
  ArrowRight, CheckCircle2, Calendar, Briefcase, ChevronRight, Timer, Sparkles
} from "lucide-react";
import { ReadinessRing } from "@/components/ReadinessRing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  getClassPulse,
  getRecommendedTopic,
} from "@/data/courseIntelligence";
import { useClassIntelligence } from "@/hooks/useClassIntelligence";
import { ContributeHub } from "@/components/ContributeHub";
import { LiveClassPulse } from "@/components/LiveClassPulse";
import { TodaysPriorities } from "@/components/TodaysPriorities";
import { 
  studentName, classes, assignments, exams, workShifts, studyStreak,
  getDaysUntil, getReadinessColor, getReadinessBg, getReadinessLabel,
  getPriorityColor
} from "@/data/demo";
import { Link, useNavigate } from "react-router-dom";

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const moods = [
  { emoji: "🎯", label: "Focused" },
  { emoji: "😫", label: "Overwhelmed" },
  { emoji: "😴", label: "Tired" },
  { emoji: "😬", label: "Behind" },
  { emoji: "👍", label: "Doing OK" },
  { emoji: "💪", label: "Trying" },
];

const moodMessages: Record<string, string> = {
  Focused: "Nice! Let's make the most of this energy. A deep study session would be perfect right now.",
  Overwhelmed: "That's okay. Let's just do one tiny thing. One flashcard set. Starting is the hardest part.",
  Tired: "Low energy? Try a 15-minute easy review. Even a little progress counts.",
  Behind: "No judgment. Let's make a simple catch-up plan — just the essentials.",
  "Doing OK": "Glad to hear it! A quick study session would keep this momentum going.",
  Trying: "That counts for a lot. Let's channel that energy into one clear next step.",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const todayClasses = classes.filter(c => c.days.includes("Fri"));
  const todayShifts = workShifts.filter(s => s.day === "Fri");
  const upcomingAssignments = [...assignments]
    .filter(a => a.status !== 'turned-in')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);
  const nextExam = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const priorityClassId = nextExam?.classId ?? classes[0]?.id;
  const intel = useClassIntelligence(priorityClassId);
  const liveTop = intel.topics[0];
  const fallbackTopic = priorityClassId ? getRecommendedTopic(priorityClassId) : null;
  const predictedTopic = liveTop ? {
    topic: liveTop.topic_name,
    probability: Math.round(liveTop.probability),
    reason: liveTop.miss_rate > 30 ? "Most students struggled here" : "Most starred by your class",
    supportingLine: `Based on ${liveTop.student_count} student${liveTop.student_count !== 1 ? "s" : ""}${liveTop.post_exam_mentions ? ` · ${liveTop.post_exam_mentions} debrief mention${liveTop.post_exam_mentions !== 1 ? "s" : ""}` : ""}`,
  } : fallbackTopic;
  const classPulse = priorityClassId ? getClassPulse(priorityClassId) : null;
  const readinessBreakdown = {
    conceptsCovered: 61,
    practiceAccuracy: 58,
    confidence: classPulse?.averageConfidence ? Math.round(classPulse.averageConfidence * 20) : 46,
    classComparison: classPulse?.classComparison ?? "You are close to your class average this week.",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* ====================================================
          HERO — Today's Priorities (class-first command center)
          ==================================================== */}
      <TodaysPriorities />

      {priorityClassId && (
        <motion.div {...fadeIn} transition={{ delay: 0.05 }}>
          <LiveClassPulse classId={priorityClassId} />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Schedule */}
          <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Today at a Glance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {todayClasses.map(c => (
                  <Link key={c.id} to={`/classes/${c.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                    <div className={`h-2 w-2 rounded-full ${c.color}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.time} · {c.location}</p>
                    </div>
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
                {todayShifts.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Work Shift</p>
                      <p className="text-xs text-muted-foreground">{s.startTime} – {s.endTime} · {s.location}</p>
                    </div>
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Daily Summary */}
          <motion.div {...fadeIn} transition={{ delay: 0.15 }}>
            <Card className="shadow-card bg-surface-warm border-border">
              <CardContent className="p-5">
                <h3 className="font-display font-semibold text-foreground mb-3">📋 Daily Summary</h3>
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>You have <Link to="/classes/math150" className="font-semibold text-primary hover:underline">College Algebra</Link> at 8:00 AM and <Link to="/classes/psych101" className="font-semibold text-primary hover:underline">Intro to Psychology</Link> at 10:00 AM</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-danger mt-0.5 flex-shrink-0" />
                    <span>Your <Link to="/exams/e1" className="font-semibold text-primary hover:underline">Algebra exam</Link> is in 5 days and readiness is low</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    <span><Link to="/assignments/a5" className="font-semibold text-primary hover:underline">Discussion post</Link> for English is due <strong>tomorrow</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>A 20-minute study session today would keep your streak going 🔥</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          {/* Upcoming Assignments */}
          <motion.div {...fadeIn} transition={{ delay: 0.2 }}>
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display flex items-center gap-2">
                    📋 Upcoming Deadlines
                  </CardTitle>
                  <Link to="/assignments" className="text-sm text-primary hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingAssignments.map(a => {
                  const days = getDaysUntil(a.dueDate);
                  return (
                    <Link key={a.id} to={`/assignments/${a.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.className}</p>
                      </div>
                      <Badge variant="secondary" className={`text-xs ${getPriorityColor(a.priority)}`}>
                        {days <= 1 ? "Tomorrow" : `${days} days`}
                      </Badge>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Class Pulse */}
          {nextExam && (
            <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
              <Card className="shadow-card border-danger/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    <span className="text-sm font-semibold text-danger">🔥 Class Pulse</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Most starred</span>
                      <span className="text-sm font-medium text-foreground text-right">{classPulse?.mostStarred.topic ?? "Polynomial Roots"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Most struggled</span>
                      <span className="text-sm font-medium text-foreground text-right">{classPulse?.mostStruggled.topic ?? "Word Problems"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Trending now</span>
                      <span className="text-sm font-medium text-foreground text-right">{classPulse?.trending.topic ?? "Graphing Polynomials"}</span>
                    </div>
                    <div className={`rounded-lg p-3 ${getReadinessBg(nextExam.readiness)}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Average class confidence</span>
                        <span className={`text-sm font-bold ${getReadinessColor(Math.round((classPulse?.averageConfidence ?? 2.1) * 20))}`}>{Math.round((classPulse?.averageConfidence ?? 2.1) * 20)}%</span>
                      </div>
                      <Progress value={Math.round((classPulse?.averageConfidence ?? 2.1) * 20)} className="h-2" />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => navigate(`/classes/${priorityClassId}`)}
                  >
                    <ArrowRight className="h-4 w-4 mr-1.5" />
                    See class guidance
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Readiness */}
          <motion.div {...fadeIn} transition={{ delay: 0.15 }}>
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Overall readiness</span>
                    <span className={`text-lg font-bold ${getReadinessColor(nextExam?.readiness ?? 50)}`}>{nextExam?.readiness ?? 50}%</span>
                  </div>
                  <Progress value={nextExam?.readiness ?? 50} className="h-2 mt-2" />
                  <p className="text-xs text-muted-foreground mt-2">{getReadinessLabel(nextExam?.readiness ?? 50)}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>Concepts Covered</span><span>{readinessBreakdown.conceptsCovered}%</span></div>
                    <Progress value={readinessBreakdown.conceptsCovered} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>Practice Accuracy</span><span>{readinessBreakdown.practiceAccuracy}%</span></div>
                    <Progress value={readinessBreakdown.practiceAccuracy} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>Confidence Level</span><span>{readinessBreakdown.confidence}%</span></div>
                    <Progress value={readinessBreakdown.confidence} className="h-1.5" />
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Class Comparison</p>
                  <p className="text-sm font-medium text-foreground mt-1">{readinessBreakdown.classComparison}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Mood Check-in */}
          <motion.div {...fadeIn} transition={{ delay: 0.2 }}>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <h3 className="font-display font-semibold text-foreground mb-2">How are you feeling?</h3>
                <p className="text-xs text-muted-foreground mb-3">This helps me suggest the right next step.</p>
                <div className="grid grid-cols-3 gap-2">
                  {moods.map(m => (
                    <button
                      key={m.label}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors text-center ${
                        selectedMood === m.label ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedMood(m.label)}
                    >
                      <span className="text-xl">{m.emoji}</span>
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </button>
                  ))}
                </div>
                {selectedMood && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20"
                  >
                    <p className="text-sm text-foreground/80">{moodMessages[selectedMood]}</p>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
            <ContributeHub defaultClassId={priorityClassId} />
          </motion.div>

          {/* Celebrate */}
          <motion.div {...fadeIn} transition={{ delay: 0.25 }}>
            <Card className="shadow-card bg-success/5 border-success/20">
              <CardContent className="p-5">
                <h3 className="font-display font-semibold text-foreground mb-1">🎉 Celebrate</h3>
                <p className="text-sm text-muted-foreground">
                  You've studied 4 days in a row! Your Biology readiness jumped 12% this week. Keep it up!
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
