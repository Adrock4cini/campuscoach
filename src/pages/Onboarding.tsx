import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Plus, Trash2, CalendarDays, FileText } from "lucide-react";
import { toast } from "sonner";
import { emptyOnboarding, type OnboardingData, type OnboardingClass } from "@/lib/onboarding/types";
import { loadCachedOnboarding, saveOnboarding } from "@/lib/onboarding/store";
import { academicTermOptions } from "@/lib/onboarding/options";
import { useAuth } from "@/contexts/AuthContext";
import { SyllabusImport } from "@/components/onboarding/SyllabusImport";
import { SchoolCombobox } from "@/components/onboarding/SchoolCombobox";
import { DayPicker } from "@/components/onboarding/DayPicker";
import { TimePicker } from "@/components/onboarding/TimePicker";


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
  const [searchParams] = useSearchParams();
  const importSyllabusMode = searchParams.get("import") === "syllabus";
  const { refreshOnboarded, profile, user } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(emptyOnboarding);
  const [saving, setSaving] = useState(false);
  const [syllabusImported, setSyllabusImported] = useState(false);
  const initialized = useRef(false);
  const termOptions = useMemo(() => academicTermOptions(), []);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;
    const cached = loadCachedOnboarding();
    const metadataName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : "";
    const name = profile?.display_name || metadataName || cached?.name || "";
    const school = profile?.schools?.name || cached?.school || "";
    const term = profile?.term || cached?.term || "";

    setData({
      ...emptyOnboarding,
      ...cached,
      name,
      school,
      term,
      learnerType: (profile?.learner_type as OnboardingData["learnerType"]) || cached?.learnerType || "college",
      workSchedule: profile?.work_schedule || cached?.workSchedule || "",
    });

    // Do not ask returning students to re-enter information already stored.
    if (importSyllabusMode) setStep(0);
    else if (name && school && term) setStep(3);
    else if (name && school) setStep(2);
    else if (name) setStep(1);
  }, [importSyllabusMode, profile, user]);

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
  const canContinue = importSyllabusMode && step === 0 ? syllabusImported : canNext;

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboarding({
        ...data,
        classes: data.classes.filter((c) => c.name.trim()),
      });
      toast.success(importSyllabusMode ? "Syllabus added" : "You're set up!", {
        description: importSyllabusMode
          ? "Your classes and detected deadlines are ready to review."
          : "Welcome to Campus Companion.",
      });
      await refreshOnboarded();
      nav(importSyllabusMode ? "/calendar" : "/dashboard", { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      toast.error("Couldn't finish setup", { description: message });
    } finally {
      setSaving(false);
    }
  };

  // Demo mode is entered from the login screen; onboarding is only reached
  // by signed-in users, so we no longer expose a "Skip · use demo" shortcut here.

  const next = () => (
    importSyllabusMode && step === 0 && syllabusImported
      ? finish()
      : step < STEPS.length - 1
      ? setStep(step + 1)
      : finish()
  );
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
                  <StepShell
                    title={importSyllabusMode ? "Import a syllabus" : "What's your name?"}
                    hint={importSyllabusMode
                      ? "Upload a PDF or photo. Review what Campus Brain found, then save it to your calendar."
                      : "First name is fine. Have a syllabus? Upload it and we'll fill in everything below."}
                  >
                    <div className="space-y-3">
                      <Input
                        autoFocus
                        value={data.name}
                        onChange={(e) => update({ name: e.target.value })}
                        placeholder="Alex"
                      />
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">I'm a…</Label>
                        <Select
                          value={data.learnerType}
                          onValueChange={(v) => update({ learnerType: v as OnboardingData["learnerType"] })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high_school">High school student</SelectItem>
                            <SelectItem value="college">College student</SelectItem>
                            <SelectItem value="certification">Certification / bootcamp</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <SyllabusImport
                        data={data}
                        onMerge={update}
                        onParsed={(parsed) => setSyllabusImported(parsed.classes.length > 0)}
                      />
                    </div>
                  </StepShell>
                )}

                {step === 1 && (
                  <StepShell title="Where do you go to school?" hint="We'll recognize your school if others already added it.">
                    <SchoolCombobox
                      value={data.school}
                      onChange={(v) => update({ school: v })}
                    />
                  </StepShell>
                )}

                {step === 2 && (
                  <StepShell title="Which term is this?" hint="Choose one standard term so classes stay organized.">
                    <Select value={data.term} onValueChange={(term) => update({ term })}>
                      <SelectTrigger autoFocus>
                        <SelectValue placeholder="Choose your term" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set(data.term && !termOptions.includes(data.term) ? [data.term, ...termOptions] : termOptions)].map((term) => (
                          <SelectItem key={term} value={term}>{term}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </StepShell>
                )}
                {step === 3 && (
                  <StepShell title="Add your classes" hint="Start with the class name. Course code and professor are optional.">
                    <div className="space-y-3">
                      {data.classes.map((c, i) => (
                        <div key={i} className="rounded-xl border border-border/60 bg-background/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Class {i + 1}</Label>
                            {data.classes.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove class ${i + 1}`}
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
                          <Input
                            value={c.name}
                            onChange={(e) => updateClass(i, { name: e.target.value })}
                            placeholder="Class name, e.g. Biology II"
                            autoFocus={i === 0}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={c.code || ""}
                              onChange={(e) => updateClass(i, { code: e.target.value })}
                              placeholder="Course code"
                            />
                            <Input
                              value={c.professor || ""}
                              onChange={(e) => updateClass(i, { professor: e.target.value })}
                              placeholder="Professor"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        className="w-full border-dashed"
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            classes: [...d.classes, { name: "", professor: "", days: [], time: "" }],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add another class
                      </Button>
                    </div>
                  </StepShell>
                )}
                {step === 4 && (
                  <StepShell title="Professor & schedule" hint="Optional but makes Campus Companion smarter.">
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
                              <DayPicker
                                value={c.days}
                                onChange={(days) => updateClass(realIdx, { days })}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <TimePicker
                                  value={c.time}
                                  onChange={(v) => updateClass(realIdx, { time: v })}
                                  placeholder="Start time"
                                />
                                <Input
                                  value={c.textbook || ""}
                                  onChange={(e) => updateClass(realIdx, { textbook: e.target.value })}
                                  placeholder="Textbook (optional)"
                                />
                              </div>
                              {((c.examDates?.length ?? 0) > 0 || (c.assignments?.length ?? 0) > 0) && (
                                <div className="pt-1 flex flex-wrap gap-1.5">
                                  {c.examDates?.map((e, ei) => (
                                    <Badge key={`e${ei}`} variant="secondary" className="text-[10px] font-normal">
                                      <CalendarDays className="h-3 w-3 mr-1" />
                                      {e.label}: {e.date}
                                    </Badge>
                                  ))}
                                  {c.assignments?.map((a, ai) => (
                                    <Badge key={`a${ai}`} variant="outline" className="text-[10px] font-normal">
                                      <FileText className="h-3 w-3 mr-1" />
                                      {a.label}: {a.dueDate}
                                    </Badge>
                                  ))}
                                </div>
                              )}

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
                      onValueChange={(v) => update({ reminderStyle: v as OnboardingData["reminderStyle"] })}
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
              <Button
                size="sm"
                className="bg-gradient-calm border-0 text-primary-foreground"
                onClick={next}
                disabled={!canContinue || saving}
              >
                {saving
                  ? (importSyllabusMode ? "Saving…" : "Setting up…")
                  : importSyllabusMode && step === 0 && syllabusImported
                  ? "Save syllabus"
                  : step === STEPS.length - 1
                  ? "Finish"
                  : "Next"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
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
