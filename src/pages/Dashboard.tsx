import { motion } from "framer-motion";
import { ChevronRight, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TodaysSnapshot } from "@/components/dashboard/TodaysSnapshot";
import { ClassesGrid } from "@/components/dashboard/ClassesGrid";
import { TodaysPlan } from "@/components/dashboard/TodaysPlan";
import { getClassPulse } from "@/data/courseIntelligence";
import {
  classes, assignments, exams,
  getDaysUntil, getPriorityColor,
} from "@/data/demo";
import { Link } from "react-router-dom";

const fadeIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
};

export default function Dashboard() {
  const upcoming = [
    ...assignments
      .filter((a) => a.status !== "turned-in")
      .map((a) => ({
        kind: "assignment" as const,
        id: a.id,
        title: a.title,
        sub: a.className,
        date: a.dueDate,
        priority: a.priority,
        to: `/assignments/${a.id}`,
      })),
    ...exams.map((e) => ({
      kind: "exam" as const,
      id: e.id,
      title: e.title,
      sub: e.className,
      date: e.date,
      priority: "high" as const,
      to: `/exams/${e.id}`,
    })),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  const pulses = classes
    .map((c) => ({ c, pulse: getClassPulse(c.id) }))
    .filter((x) => x.pulse)
    .slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* 1. Compact snapshot hero */}
      <TodaysSnapshot />

      {/* 2. PRIMARY: Your classes */}
      <ClassesGrid />

      {/* 3. AI-generated plan */}
      <TodaysPlan />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 4. Upcoming */}
        <motion.div {...fadeIn} className="lg:col-span-3">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">Upcoming</CardTitle>
                <Link to="/your-week" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Week <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcoming.map((u) => {
                const days = getDaysUntil(u.date);
                return (
                  <Link
                    key={`${u.kind}-${u.id}`}
                    to={u.to}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${u.kind === "exam" ? "bg-danger" : "bg-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.kind === "exam" ? "Exam · " : ""}{u.sub}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`text-xs ${getPriorityColor(u.priority)}`}>
                      {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                    </Badge>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* 5. Class pulse summary */}
        <motion.div {...fadeIn} transition={{ delay: 0.05 }} className="lg:col-span-2">
          <Card className="shadow-card h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Class pulse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pulses.map(({ c, pulse }) => (
                <Link key={c.id} to={`/classes/${c.id}`} className="block group">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
                    <span className="text-muted-foreground truncate">{c.name}</span>
                  </div>
                  <p className="text-sm text-foreground mt-0.5 truncate group-hover:text-primary transition-colors">
                    {pulse!.mostStruggled.studentCount} students focused on{" "}
                    <span className="font-medium">{pulse!.mostStruggled.topic}</span>
                  </p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
