import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getClassPulse } from "@/data/courseIntelligence";
import { TodaysPriorities } from "@/components/TodaysPriorities";
import {
  classes, assignments, exams,
  getDaysUntil, getReadinessColor, getPriorityColor
} from "@/data/demo";
import { Link, useNavigate } from "react-router-dom";

const fadeIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
};

export default function Dashboard() {
  const navigate = useNavigate();

  const upcomingAssignments = [...assignments]
    .filter(a => a.status !== 'turned-in')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);
  const nextExam = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  const priorityClassId = nextExam?.classId ?? classes[0]?.id;
  const classPulse = priorityClassId ? getClassPulse(priorityClassId) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* 1. Today's priorities (class-first) */}
      <TodaysPriorities />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Upcoming deadlines */}
        <motion.div {...fadeIn} className="lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">Upcoming</CardTitle>
                <Link to="/assignments" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  All <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcomingAssignments.map(a => {
                const days = getDaysUntil(a.dueDate);
                return (
                  <Link key={a.id} to={`/assignments/${a.id}`} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.className}</p>
                    </div>
                    <Badge variant="secondary" className={`text-xs ${getPriorityColor(a.priority)}`}>
                      {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                    </Badge>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* 3. Readiness overview */}
        <motion.div {...fadeIn} transition={{ delay: 0.05 }}>
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {classes.slice(0, 4).map(c => (
                <Link key={c.id} to={`/classes/${c.id}`} className="block group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground/80 truncate">{c.name}</span>
                    <span className={`font-semibold ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
                  </div>
                  <Progress value={c.readiness} className="h-1" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 4. Community insights */}
      {classPulse && (
        <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">From your class</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate(`/classes/${priorityClassId}`)}>
                  Open <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">🔥 Most tested</p>
                  <p className="text-sm font-medium text-foreground">{classPulse.mostStarred.topic}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">⚠️ Most missed</p>
                  <p className="text-sm font-medium text-foreground">{classPulse.mostStruggled.topic}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">📈 Trending</p>
                  <p className="text-sm font-medium text-foreground">{classPulse.trending.topic}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
