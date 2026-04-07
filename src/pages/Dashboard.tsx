import { useState } from "react";
import { motion } from "framer-motion";
import { 
  BookOpen, Clock, AlertTriangle, TrendingUp, Zap, Flame, 
  ArrowRight, CheckCircle2, Calendar, Briefcase, ChevronRight, Timer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Greeting */}
      <motion.div {...fadeIn}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">
              Good morning, {studentName} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Friday, April 4 · You've got this today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-accent/10 text-accent px-3 py-1.5 rounded-full">
              <Flame className="h-4 w-4" />
              <span className="text-sm font-semibold">{studyStreak}-day streak</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* What should I do right now? */}
      <motion.div {...fadeIn} transition={{ delay: 0.05 }}>
        <Card className="border-primary/20 bg-primary/5 shadow-soft">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-calm flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-foreground text-lg">What should I do right now?</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Your Algebra exam is in <strong>5 days</strong> and your readiness is at 34%. 
                  A 25-minute practice session on polynomial functions would help a lot.
                </p>
                <Button
                  size="sm"
                  className="mt-3 bg-gradient-calm border-0 text-primary-foreground hover:opacity-90"
                  onClick={() => navigate("/focus-sprint?classId=math150&duration=25")}
                >
                  <Timer className="h-4 w-4 mr-1.5" />
                  Start 25-min Focus Sprint
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

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
          {/* Exam Countdown */}
          {nextExam && (
            <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
              <Card className="shadow-card border-danger/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    <span className="text-sm font-semibold text-danger">Next Exam</span>
                  </div>
                  <h4 className="font-display font-semibold text-foreground">{nextExam.title}</h4>
                  <p className="text-sm text-muted-foreground mb-3">{nextExam.className} · {getDaysUntil(nextExam.date)} days away</p>
                  <div className={`rounded-lg p-3 ${getReadinessBg(nextExam.readiness)}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Readiness</span>
                      <span className={`text-sm font-bold ${getReadinessColor(nextExam.readiness)}`}>{nextExam.readiness}%</span>
                    </div>
                    <Progress value={nextExam.readiness} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1.5">{getReadinessLabel(nextExam.readiness)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => navigate(`/exams/${nextExam.id}`)}
                  >
                    <ArrowRight className="h-4 w-4 mr-1.5" />
                    Start Studying
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Class Readiness */}
          <motion.div {...fadeIn} transition={{ delay: 0.15 }}>
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-display">Readiness by Class</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {classes.map(c => (
                  <Link key={c.id} to={`/classes/${c.id}`} className="block">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className={`h-3 w-3 rounded-full ${c.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <Progress value={c.readiness} className="h-1.5 mt-1" />
                      </div>
                      <span className={`text-sm font-bold ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
                    </div>
                  </Link>
                ))}
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
