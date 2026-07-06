import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { emptyOnboarding, type OnboardingData, type OnboardingClass } from "@/lib/onboarding/types";
import { saveOnboarding, markDemoMode } from "@/lib/onboarding/store";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STEPS = [
  "You",
  "School",
  "Term",
  "Classes",
  "Schedule",
  "Work",
  "Reminders",
  "Goal",
];

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(emptyOnboarding);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<OnboardingData>) => setData((d) => ({ ...d, ...patch }));
  const updateClass = (i: number, patch: Partial<OnboardingClass>) =>
    setData((d) => ({
      ...d,
      classes: d.classes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));

  const canNext = (() => {
    switch (step) {
      case 0: return data.name.trim().length > 0;
      case 1: return data.school.trim().length > 0;
      case 2: return data.term.trim().length > 0;
      case 3: return data.classes.some((c) => c.name.trim().length > 0);
      default: return true;
    }
  })();

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboarding({
        ...data,
        classes: data.classes.filter((c) => c.name.trim()),
      });
      toast.success("You're set up!", { description: "Welcome to Campus Coach." });
      nav("/dashboard", { replace: true });
    } catch (e) {
      toast.error("Couldn't finish setup", { description: "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const useDemo = () => {
    markDemoMode();
    toast("Using demo mode", { description: "You can set up your real classes anytime in Settings." });
    nav("/dashboard", { replace: true });
  };

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish());
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <Card className="shadow-elevated">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </p>
              <Badge variant="secondary" className="text-[10px]">{STEPS[step]}</Badge>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mt-4"
              >
                {step === 0 && (
                  <StepShell title="What's your name?" hint="First name is fine.">
                    <Input
                      autoFocus
                      value={data.name}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder="Alex"
                    />
                  </StepShell>
                )}
                {step === 1 && (
                  <StepShell title="Where do you go to school?">
                    <Input
                      autoFocus
                      value={data.school}
                      onChange={(e) => update({ school: e.target.value })}
                      placeholder="State University"
                    />
                  </StepShell>
                )}
                {step === 2 && (
                  <StepShell title="Which term is this?">
                    <Input
                      autoFocus
                      value={data.term}
                      onChange={(e) => update({ term: e.target.value })}
                      placeholder="Spring 2026"
                    />
                  </StepShell>
                )}
                {step === 3 && (
                  <StepShell title="Add your classes" hint="Just the names for now — you can add details next.">
                    <div className="space-y-2">
                      {data.classes.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            value={c.name}
                            onChange={(e) => updateClass(i, { name: e.target.value })}
                            placeholder={`Class ${i + 1}`}
                          />
                          {data.classes.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setData((d) => ({
                                  ...d,
                                  classes: d.classes.filter((_, idx) => idx !== i),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            classes: [...d.classes, { name: "", professor: "", days: [], time: "" }],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add class
                      </Button>
                    </div>
                  </StepShell>
                )}
                {step === 4 && (
                  <StepShell title="Professor & schedule" hint="Optional but makes Campus Coach smarter.">
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                      {data.classes
                        .filter((c) => c.name.trim())
                        .map((c, i) => {
                          const realIdx = data.classes.indexOf(c);
                          return (
                            <div key={realIdx} className="rounded-lg border border-border/60 p-3 space-y-2">
                              <p className="text-sm font-medium">{c.name}</p>
                              <Input
                                value={c.professor || ""}
                                onChange={(e) => updateClass(realIdx, { professor: e.target.value })}
                                placeholder="Professor (optional)"
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {DAYS.map((d) => {
                                  const active = c.days.includes(d);
                                  return (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={() =>
                                        updateClass(realIdx, {
                                          days: active
                                            ? c.days.filter((x) => x !== d)
                                            : [...c.days, d],
                                        })
                                      }
                                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background border-border hover:border-primary/50"
                                      }`}
                                    >
                                      {d}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  value={c.time || ""}
                                  onChange={(e) => updateClass(realIdx, { time: e.target.value })}
                                  placeholder="Time (10:00 AM)"
                                />
                                <Input
                                  value={c.textbook || ""}
                                  onChange={(e) => updateClass(realIdx, { textbook: e.target.value })}
                                  placeholder="Textbook (optional)"
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </StepShell>
                )}
                {step === 5 && (
                  <StepShell title="Work schedule" hint="Optional — helps plan study time.">
                    <Textarea
                      value={data.workSchedule || ""}
                      onChange={(e) => update({ workSchedule: e.target.value })}
                      placeholder="e.g. Tue/Thu 4–8pm, Sat 10–4"
                      className="min-h-[80px]"
                    />
                  </StepShell>
                )}
                {step === 6 && (
                  <StepShell title="How should we remind you?">
                    <Select
                      value={data.reminderStyle}
                      onValueChange={(v: any) => update({ reminderStyle: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gentle">Gentle — light nudges</SelectItem>
                        <SelectItem value="standard">Standard — regular reminders</SelectItem>
                        <SelectItem value="high">High — stay on top of me</SelectItem>
                      </SelectContent>
                    </Select>
                  </StepShell>
                )}
                {step === 7 && (
                  <StepShell title="What's your goal this term?" hint="One sentence. You can change it later.">
                    <Textarea
                      autoFocus
                      value={data.studyGoal}
                      onChange={(e) => update({ studyGoal: e.target.value })}
                      placeholder="Raise my GPA to 3.5 and not fall behind in Bio."
                      className="min-h-[80px]"
                    />
                  </StepShell>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between mt-6">
              <Button variant="ghost" size="sm" onClick={back} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={useDemo}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Skip · use demo
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-calm border-0 text-primary-foreground"
                  onClick={next}
                  disabled={!canNext || saving}
                >
                  {step === STEPS.length - 1 ? (saving ? "Setting up…" : "Finish") : "Next"}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl md:text-2xl font-display font-semibold text-foreground leading-tight">
          {title}
        </h2>
        {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}
