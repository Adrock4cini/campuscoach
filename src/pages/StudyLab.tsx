import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { classes } from "@/data/demo";
import { 
  FlaskConical, Brain, Zap, Target, Gamepad2, Clock, 
  ArrowRight, Sparkles, Trophy 
} from "lucide-react";

const studyModes = [
  { icon: Brain, label: "Flashcards", desc: "Quick recall practice", color: "bg-primary/10 text-primary" },
  { icon: Target, label: "Multiple Choice", desc: "Test your knowledge", color: "bg-accent/10 text-accent" },
  { icon: Sparkles, label: "Fill in the Blank", desc: "Active recall training", color: "bg-success/10 text-success" },
  { icon: Zap, label: "True / False", desc: "Fast-paced review", color: "bg-warning/10 text-warning" },
  { icon: Gamepad2, label: "Matching Game", desc: "Connect concepts", color: "bg-primary/10 text-primary" },
  { icon: Trophy, label: "Timed Challenge", desc: "Beat your best score", color: "bg-danger/10 text-danger" },
];

export default function StudyLab() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Study Lab</h1>
        <p className="text-muted-foreground mt-1">Turn your notes into interactive study sessions. Choose a mode and let's go.</p>
      </div>

      {/* Focus Sprint */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="shadow-card border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-calm flex items-center justify-center flex-shrink-0">
                <Clock className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-foreground text-lg">Focus Sprint</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick a class, choose your time, and study with zero distractions. 
                  You'll get a progress summary when you're done.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10">15 min</Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10 bg-primary/10 text-primary">25 min</Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10">45 min</Badge>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {classes.map(c => (
                    <Badge key={c.id} variant="outline" className="cursor-pointer hover:bg-muted text-xs">
                      {c.name}
                    </Badge>
                  ))}
                </div>
                <Button size="sm" className="mt-4 bg-gradient-calm border-0 text-primary-foreground hover:opacity-90">
                  <ArrowRight className="h-4 w-4 mr-1.5" />
                  Start Focus Sprint
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Study Modes Grid */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-4">Study Modes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {studyModes.map((mode, i) => (
            <motion.div
              key={mode.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer group">
                <CardContent className="p-5">
                  <div className={`h-10 w-10 rounded-lg ${mode.color} flex items-center justify-center mb-3`}>
                    <mode.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{mode.label}</h3>
                  <p className="text-sm text-muted-foreground">{mode.desc}</p>
                  <div className="mt-3 flex items-center text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Start <ArrowRight className="h-3 w-3 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-soft bg-surface-warm">
        <CardContent className="p-5">
          <h3 className="font-display font-semibold text-foreground mb-2">🧠 "I only have 15 minutes"</h3>
          <p className="text-sm text-muted-foreground mb-3">
            No problem. Here's what would make the biggest impact right now:
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Review Algebra Chapter 4 flashcards</p>
                <p className="text-xs text-muted-foreground">~10 min · Biggest impact on your exam readiness</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Quick quiz: Psychology Memory models</p>
                <p className="text-xs text-muted-foreground">~8 min · Your weakest topic for the upcoming exam</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overwhelmed */}
      <Card className="shadow-soft bg-accent/5 border-accent/20">
        <CardContent className="p-5 text-center">
          <p className="text-2xl mb-2">😮‍💨</p>
          <h3 className="font-display font-semibold text-foreground mb-1">"I feel overwhelmed"</h3>
          <p className="text-sm text-muted-foreground mb-3">
            That's okay. Let's do just one tiny thing. One flashcard set. One quick review. 
            Starting is the hardest part, and you just did it by opening this page.
          </p>
          <Button size="sm" variant="outline">
            Give me the easiest next step
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
