import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getDaysUntil, getReadinessColor, getReadinessLabel } from "@/data/demo";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { MapPin, Clock, User, BookOpen, ArrowRight, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function MyClasses() {
  const { classes } = useMyClasses();
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">My Classes</h1>
        <p className="text-muted-foreground mt-1">Your semester at a glance. Tap a class to dive deeper.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {classes.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Link to={`/classes/${c.id}`}>
              <Card className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${c.color}`} />
                      <h3 className="font-display font-semibold text-foreground text-lg">{c.name}</h3>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" /><span>{c.professor}</span></div>
                    <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /><span>{c.days.join("/")} · {c.time}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /><span>{c.location}</span></div>
                    <div className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5" /><span>Current: {c.currentTopic}</span></div>
                  </div>

                  {c.nextExamDate && (
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs bg-danger/10 text-danger">
                        Exam in {getDaysUntil(c.nextExamDate)} days
                      </Badge>
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Readiness</span>
                      <span className={`text-sm font-bold ${getReadinessColor(c.readiness)}`}>{c.readiness}%</span>
                    </div>
                    <Progress value={c.readiness} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{getReadinessLabel(c.readiness)}</p>
                  </div>

                  <div className="flex items-center gap-1.5 mb-3">
                    {c.chapters.map(ch => (
                      <div key={ch.number} title={`Ch ${ch.number}: ${ch.title}`}>
                        {ch.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-success" /> :
                         ch.status === 'in-progress' ? <Loader2 className="h-4 w-4 text-warning" /> :
                         <Circle className="h-4 w-4 text-muted-foreground/30" />}
                      </div>
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">chapters</span>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-primary font-medium">💡 {c.suggestedAction}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <Button variant="outline" className="w-full border-dashed">
        + Add a New Class
      </Button>
    </div>
  );
}
