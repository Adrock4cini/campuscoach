import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Sparkles, AlertTriangle, CheckCircle2, Loader2,
  Circle, ArrowRight, TrendingUp, Calendar,
} from "lucide-react";
import { degreeMeta, requirements, upcomingPlan, aiInsights } from "@/data/graduation";

const statusIcon = {
  completed: <CheckCircle2 className="h-4 w-4 text-success" />,
  "in-progress": <Loader2 className="h-4 w-4 text-warning" />,
  planned: <Circle className="h-4 w-4 text-primary/50" />,
  missing: <AlertTriangle className="h-4 w-4 text-danger" />,
};

const loadColor = {
  light: "text-success",
  balanced: "text-primary",
  heavy: "text-danger",
};

export default function PathToGraduation() {
  const pct = Math.round(
    ((degreeMeta.creditsCompleted + degreeMeta.creditsInProgress) / degreeMeta.totalCreditsRequired) * 100
  );

  const byCategory = ["Core", "Major", "General Ed", "Elective"].map((cat) => ({
    cat,
    items: requirements.filter((r) => r.category === cat),
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-border/60 glass-strong noise-overlay p-6 md:p-10"
      >
        <div aria-hidden className="absolute -top-24 -right-24 h-[320px] w-[320px] rounded-full bg-primary/20 blur-[100px]" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="flex-shrink-0 h-20 w-20 rounded-2xl bg-gradient-calm flex items-center justify-center shadow-glow">
            <GraduationCap className="h-10 w-10 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] uppercase tracking-[0.22em] text-primary/90">Your academic GPS</span>
            <h1 className="text-3xl md:text-4xl font-display font-semibold mt-1 tracking-tight">
              Path to Graduation
            </h1>
            <p className="mt-2 text-foreground/70">
              {degreeMeta.major} · {degreeMeta.school}
            </p>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
              <Stat label="Completed" value={`${degreeMeta.creditsCompleted}`} sub="credits" />
              <Stat label="In progress" value={`${degreeMeta.creditsInProgress}`} sub="credits" />
              <Stat label="GPA" value={degreeMeta.gpa.toFixed(2)} sub="cumulative" />
              <Stat label="Graduates" value={degreeMeta.estimatedGraduation} sub="estimated" />
            </div>

            <div className="mt-6 max-w-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Degree progress</span>
                <span className="text-sm font-semibold text-foreground">{pct}%</span>
              </div>
              <Progress value={pct} className="h-3" />
              <p className="text-xs text-success mt-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> {degreeMeta.pace}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* AI Insights */}
      <Card className="shadow-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Smart Degree Guidance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {aiInsights.map((i) => (
            <p key={i} className="text-sm text-foreground/80">• {i}</p>
          ))}
        </CardContent>
      </Card>

      {/* Requirements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {byCategory.map(({ cat, items }) => (
          <motion.div key={cat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="shadow-card h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center justify-between">
                  <span>{cat}</span>
                  <Badge variant="secondary" className="text-xs">
                    {items.filter((i) => i.status === "completed").length}/{items.length} done
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                    {statusIcon[r.status]}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.credits} cr {r.semester ? `· ${r.semester}` : r.status === "missing" ? "· not yet scheduled" : ""}
                      </p>
                    </div>
                    {r.status === "missing" && (
                      <Badge variant="outline" className="text-[10px] border-danger/30 text-danger">Missing</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Semester roadmap */}
      <div>
        <h2 className="text-xl font-display font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Semester Roadmap
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {upcomingPlan.map((p) => (
            <Card key={p.term} className={`shadow-card ${p.warning ? "border-warning/30" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-foreground">{p.term}</h3>
                  <Badge variant="secondary" className={`text-xs ${loadColor[p.load]}`}>
                    {p.totalCredits} credits · {p.load}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {p.classes.map((cl) => (
                    <div key={cl.name} className="flex items-center justify-between text-sm">
                      <span className="text-foreground/80">{cl.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{cl.credits} cr</span>
                        {cl.risk === "high" && <span className="h-1.5 w-1.5 rounded-full bg-danger" title="Higher workload" />}
                        {cl.risk === "med" && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
                        {cl.risk === "low" && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                      </div>
                    </div>
                  ))}
                </div>
                {p.warning && (
                  <div className="mt-4 rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm text-foreground/80 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                    {p.warning}
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-4 w-full">
                  Adjust this semester <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 backdrop-blur px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-display font-semibold text-foreground mt-0.5">{value}</div>
      <div className="text-[10px] text-muted-foreground/70">{sub}</div>
    </div>
  );
}
