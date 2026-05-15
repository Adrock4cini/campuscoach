import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, Sparkles, AlertTriangle, CheckCircle2, Loader2,
  Circle, ArrowRight, TrendingUp, Calendar, Target, Calculator,
} from "lucide-react";
import { degreeMeta, requirements, upcomingPlan, aiInsights, type Requirement } from "@/data/graduation";
import { cn } from "@/lib/utils";

const statusIcon: Record<Requirement["status"], JSX.Element> = {
  completed:    <CheckCircle2 className="h-4 w-4 text-success" />,
  "in-progress": <Loader2 className="h-4 w-4 text-warning" />,
  planned:      <Circle className="h-4 w-4 text-primary/50" />,
  missing:      <AlertTriangle className="h-4 w-4 text-danger" />,
};

const statusDot: Record<Requirement["status"], string> = {
  completed:    "bg-success",
  "in-progress": "bg-warning",
  planned:      "bg-primary/50",
  missing:      "bg-danger",
};

const loadColor = {
  light: "text-success",
  balanced: "text-primary",
  heavy: "text-danger",
};

// GPA values for grade letters
const gradePoints: Record<string, number> = {
  "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D": 1.0, "F": 0,
};

export default function PathToGraduation() {
  const totalCredits = degreeMeta.creditsCompleted + degreeMeta.creditsInProgress;
  const pct = Math.round((totalCredits / degreeMeta.totalCreditsRequired) * 100);
  const remainingCredits = degreeMeta.totalCreditsRequired - totalCredits;

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
                <span className="text-sm font-semibold text-foreground">
                  {pct}% · {remainingCredits} credits to go
                </span>
              </div>
              <Progress value={pct} className="h-3" />
              <p className="text-xs text-success mt-2 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> {degreeMeta.pace}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Visual progress tree — branch per category */}
      <ProgressTree byCategory={byCategory} />

      {/* What-if GPA simulator */}
      <WhatIfGpaSimulator />

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

      {/* Requirements grid */}
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
                        {cl.risk === "med"  && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
                        {cl.risk === "low"  && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
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

/* -------------------- Progress tree -------------------- */

function ProgressTree({
  byCategory,
}: {
  byCategory: { cat: string; items: Requirement[] }[];
}) {
  return (
    <Card className="shadow-card relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -right-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Progress Tree
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {byCategory.map(({ cat, items }) => {
            const done = items.filter((i) => i.status === "completed").length;
            const inProg = items.filter((i) => i.status === "in-progress").length;
            const pctCat = items.length === 0 ? 0 : Math.round(((done + inProg * 0.5) / items.length) * 100);
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{cat}</p>
                  <span className="text-xs font-semibold text-foreground">{pctCat}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pctCat}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-calm"
                  />
                </div>
                {/* Branch nodes */}
                <div className="pt-2 space-y-1.5">
                  {items.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", statusDot[r.status])} />
                      <span className={cn(
                        "truncate",
                        r.status === "completed" ? "text-foreground/70 line-through" : "text-foreground/85",
                      )}>{r.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- What-if GPA simulator -------------------- */

function WhatIfGpaSimulator() {
  // Current in-progress courses the student can simulate grades for
  const inProgress = useMemo(
    () => requirements.filter((r) => r.status === "in-progress"),
    [],
  );
  const [grades, setGrades] = useState<Record<string, string>>(() =>
    Object.fromEntries(inProgress.map((r) => [r.id, "B+"])),
  );
  const [futureCredits, setFutureCredits] = useState<number>(15); // additional planned credits
  const [futureGpa, setFutureGpa] = useState<number>(3.5);

  const projectedGpa = useMemo(() => {
    // Existing completed credits at known cumulative GPA
    const completedQp = degreeMeta.creditsCompleted * degreeMeta.gpa;

    // Simulated in-progress
    let simCredits = 0;
    let simQp = 0;
    inProgress.forEach((r) => {
      const pts = gradePoints[grades[r.id] ?? "B"];
      simCredits += r.credits;
      simQp += r.credits * pts;
    });

    // Hypothetical future
    const futQp = futureCredits * futureGpa;

    const totalCr = degreeMeta.creditsCompleted + simCredits + futureCredits;
    const totalQp = completedQp + simQp + futQp;
    return totalCr === 0 ? 0 : totalQp / totalCr;
  }, [grades, futureCredits, futureGpa, inProgress]);

  const delta = projectedGpa - degreeMeta.gpa;
  const deltaColor = delta > 0.05 ? "text-success" : delta < -0.05 ? "text-danger" : "text-muted-foreground";

  return (
    <Card className="shadow-card relative overflow-hidden border-accent/20">
      <div aria-hidden className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" /> What-If GPA Simulator
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Try different grade outcomes — see your projected cumulative GPA in real time.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Projected outcome */}
        <div className="rounded-2xl border border-border/50 bg-background/30 p-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Projected cumulative GPA</p>
            <p className="text-4xl font-display font-semibold text-foreground mt-1">
              {projectedGpa.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">vs current {degreeMeta.gpa.toFixed(2)}</p>
            <p className={cn("text-lg font-semibold", deltaColor)}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Per-class grade selectors */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">This semester</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {inProgress.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/20 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.credits} credits</p>
                </div>
                <Select
                  value={grades[r.id]}
                  onValueChange={(v) => setGrades((g) => ({ ...g, [r.id]: v }))}
                >
                  <SelectTrigger className="h-8 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(gradePoints).map((g) => (
                      <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {/* Future trajectory sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Additional future credits</span>
              <span className="text-xs font-semibold text-foreground">{futureCredits}</span>
            </div>
            <Slider
              value={[futureCredits]}
              min={0}
              max={60}
              step={3}
              onValueChange={(v) => setFutureCredits(v[0])}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Average grade going forward</span>
              <span className="text-xs font-semibold text-foreground">{futureGpa.toFixed(2)}</span>
            </div>
            <Slider
              value={[futureGpa]}
              min={1}
              max={4}
              step={0.05}
              onValueChange={(v) => setFutureGpa(v[0])}
            />
          </div>
        </div>
      </CardContent>
    </Card>
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
