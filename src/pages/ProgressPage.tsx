import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { classes, studyStreak, studySessions, getReadinessColor } from "@/data/demo";
import { Flame, TrendingUp, BookOpen, Brain, Trophy, Target } from "lucide-react";

export default function ProgressPage() {
  const totalFlashcards = 142;
  const totalQuizzes = 18;
  const avgQuizScore = 74;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Progress</h1>
        <p className="text-muted-foreground mt-1">Look how far you've come. Every bit counts.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Flame, label: "Study Streak", value: `${studyStreak} days`, color: "text-accent" },
          { icon: Brain, label: "Flashcards Done", value: `${totalFlashcards}`, color: "text-primary" },
          { icon: Trophy, label: "Quizzes Taken", value: `${totalQuizzes}`, color: "text-success" },
          { icon: Target, label: "Avg Quiz Score", value: `${avgQuizScore}%`, color: "text-warning" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="shadow-card">
              <CardContent className="p-4 text-center">
                <stat.icon className={`h-6 w-6 mx-auto mb-2 ${stat.color}`} />
                <p className="text-2xl font-bold font-display text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Readiness by class */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Readiness by Class
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.map(c => (
            <div key={c.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  <span className="text-sm font-medium text-foreground">{c.name}</span>
                </div>
                <span className={`text-sm font-bold ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
              </div>
              <Progress value={c.readiness} className="h-2.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Study history */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Recent Study Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {studySessions.map(s => {
              const cls = classes.find(c => c.id === s.classId);
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`h-2 w-2 rounded-full ${cls?.color || "bg-muted"}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{s.type}</p>
                    <p className="text-xs text-muted-foreground">{cls?.name} · {s.date} · {s.duration} min</p>
                  </div>
                  {s.score !== undefined && (
                    <span className={`text-sm font-bold ${getReadinessColor(s.score)}`}>{s.score}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Motivation */}
      <Card className="shadow-soft bg-success/5 border-success/20">
        <CardContent className="p-5 text-center">
          <p className="text-2xl mb-2">🌟</p>
          <h3 className="font-display font-semibold text-foreground mb-1">Most Improved: Biology II</h3>
          <p className="text-sm text-muted-foreground">
            Your readiness jumped 12% this week. Consistency is paying off!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
