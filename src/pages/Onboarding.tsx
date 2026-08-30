import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Plus, Trash2, CalendarDays, FileText } from "lucide-react";
import { toast } from "sonner";
import { emptyOnboarding, type OnboardingData, type OnboardingClass } from "@/lib/onboarding/types";
import { cacheOnboardingDraft, loadCachedOnboarding, saveOnboarding } from "@/lib/onboarding/store";
import { academicTermOptions } from "@/lib/onboarding/options";
import { useAuth } from "@/contexts/AuthContext";
import { SchoolCombobox } from "@/components/onboarding/SchoolCombobox";
import { DayPicker } from "@/components/onboarding/DayPicker";
import { TimePicker } from "@/components/onboarding/TimePicker";
import { DatePickerField } from "@/components/forms/DatePickerField";
import {
  hydrateCachedOnboardingClass,
  prepareNewOnboardingClass,
} from "@/lib/onboarding/classIdentity";
import { normalizeTimeKey } from "@/lib/calendar/classSchedule";
import { shouldSkipCompletedOnboarding } from "@/lib/onboarding/onboardingEntry";
import { isDateKey } from "@/lib/calendar/dateKey";
import { readLastRoute } from "@/lib/app/routeMemory";


export const ONBOARDING_STEPS = [
  "You",
  "School",
  "Term",
  "Classes",
  "Schedule",
];
const STEPS = ONBOARDING_STEPS;

export function isOnboardingIdentityValid(data: Pick<OnboardingData, "name" | "learnerType">) {
  return data.name.trim().length > 0 && data.learnerType !== "";
}

export default function Onboarding() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const importSyllabusMode = searchParams.get("import") === "syllabus";
  const { refreshOnboarded, profile, user, setupStatus } = useAuth();
  // A finished account must never silently re-run setup: that is how duplicate
  // classes appear. Explicit intent (?intent=add) still allows a re-entry.
  const skipCompletedSetup = shouldSkipCompletedOnboarding({
    setupStatus,
    intent: searchParams.get("intent"),
  });
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(() => ({
    ...emptyOnboarding,
    classes: emptyOnboarding.classes.map(prepareNewOnboardingClass),
  }));
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const termOptions = useMemo(() => academicTermOptions(), []);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;
    const cached = loadCachedOnboarding(user.id);
    const metadataName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.split(" ")[0]
      : "";
    const name = profile?.display_name || metadataName || cached?.name || "";
    const school = profile?.schools?.name || cached?.school || "";
    const term = profile?.term || cached?.term || "";

    const learnerType: OnboardingData["learnerType"] = (profile?.learner_type as OnboardingData["learnerType"])
      || cached?.learnerType
      || "";
    const merged = {
      ...emptyOnboarding,
      ...cached,
      name,
      school,
      term,
      learnerType,
      workSchedule: profile?.work_schedule || cached?.workSchedule || "",
    };
    setData({
      ...merged,
      classes: (cached?.classes ?? emptyOnboarding.classes).map(
        cached ? hydrateCachedOnboardingClass : prepareNewOnboardingClass,
      ),
    });
    setHydratedUserId(user.id);

    // Do not ask returning students to re-enter information already stored.
    if (importSyllabusMode) setStep(0);
    else if (name && learnerType && school && term) setStep(3);
    else if (name && learnerType && school) setStep(2);
    else if (name && learnerType) setStep(1);
  }, [importSyllabusMode, profile, user]);

  useEffect(() => {
    if (!hydratedUserId || hydratedUserId !== user?.id || importSyllabusMode) return;
    cacheOnboardingDraft(data, hydratedUserId);
  }, [data, hydratedUserId, importSyllabusMode, user?.id]);

  // The returning-student importer used to create or overwrite classes from
  // an unscoped file. Every syllabus now belongs to one already-chosen class.
  if (importSyllabusMode) {
    return <Navigate to="/classes?intent=syllabus" replace />;
  }

  if (skipCompletedSetup) {
    return <Navigate to="/dashboard" replace />;
  }

  const update = (patch: Partial<OnboardingData>) => setData((d) => ({ ...d, ...patch }));
  const updateClass = (i: number, patch: Partial<OnboardingClass>) =>
    setData((d) => ({
      ...d,
      classes: d.classes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));

  const canNext = (() => {
    switch (step) {
      case 0: return isOnboardingIdentityValid(data);
      case 1: return data.school.trim().length > 0;
      case 2: return data.term.trim().length > 0;
      case 3: return data.classes.some((c) => c.name.trim().length > 0);
      case 4: return data.classes.filter((c) => c.name.trim()).every(isOnboardingClassScheduleValid);
      default: return true;
    }
  })();
  const canContinue = canNext;

  const finish = async () => {
    setSaving(true);
    try {
      await saveOnboarding({
        ...data,
        classes: data.classes.filter((c) => c.name.trim()),
      }, user?.id);
      toast.success("You're set up!", {
        description: "Welcome to Campus Companion.",
      });
      await refreshOnboarded();
      nav(readLastRoute() ?? "/dashboard", { replace: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      toast.error("Couldn't finish setup", { description: message });
    } finally {
      setSaving(false);
    }
  };

  // Demo mode is entered from the login screen; onboarding is only reached
  // by signed-in users, so we no longer expose a "Skip · use demo" shortcut here.

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else void finish();
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-[80vh] flex items-start justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] md:items-center">
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
                    title="What's your name?"
                    hint="First name is fine. You can change this later."
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
                          <SelectTrigger><SelectValue placeholder="Choose student type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="middle_school">Middle school student</SelectItem>
                            <SelectItem value="high_school">High school student</SelectItem>
                            <SelectItem value="college">College student</SelectItem>
                            <SelectItem value="certification">Certification / bootcamp</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                  <StepShell title="Add your classes" hint="Start with the class name. Course code and teacher or instructor are optional.">
                    <div className="space-y-3">
                      {data.classes.map((c, i) => (
                        <div key={c.clientClassId || i} className="rounded-xl border border-border/60 bg-background/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Class {i + 1}</Label>
                            {data.classes.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
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
                              placeholder="Teacher or instructor"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        className="min-h-11 w-full border-dashed"
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            classes: [...d.classes, prepareNewOnboardingClass({ name: "", professor: "", days: [], time: "" })],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add another class
                      </Button>
                    </div>
                  </StepShell>
                )}
                {step === 4 && (
                  <StepShell title="Teacher & schedule" hint="Optional. Add anything you know now, or finish and update it later.">
                    <div className="space-y-4 pr-1">
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
                                placeholder="Teacher or instructor (optional)"
                              />
                              <DayPicker
                                value={c.days}
                                onChange={(days) => updateClass(realIdx, { days })}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label htmlFor={`class-${realIdx}-start-time`}>Starts <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                                  <TimePicker
                                    id={`class-${realIdx}-start-time`}
                                    value={c.time}
                                    onChange={(v) => updateClass(realIdx, { time: v })}
                                    placeholder="Start time"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`class-${realIdx}-end-time`}>Ends <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                                  <TimePicker
                                    id={`class-${realIdx}-end-time`}
                                    value={c.endTime}
                                    onChange={(v) => updateClass(realIdx, { endTime: v })}
                                    placeholder="End time"
                                  />
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <DatePickerField
                                  id={`class-${realIdx}-term-start`}
                                  label="Term starts"
                                  value={c.semesterStartDate ?? ""}
                                  onChange={(semesterStartDate) => updateClass(realIdx, { semesterStartDate })}
                                  required={c.days.length > 0}
                                />
                                <DatePickerField
                                  id={`class-${realIdx}-term-end`}
                                  label="Term ends"
                                  value={c.semesterEndDate ?? ""}
                                  onChange={(semesterEndDate) => updateClass(realIdx, { semesterEndDate })}
                                  min={c.semesterStartDate || undefined}
                                  required={c.days.length > 0}
                                />
                              </div>
                              {!isOnboardingClassScheduleValid(c) && (
                                <p role="alert" className="text-xs font-medium text-destructive">
                                  Choose class days with matching term dates, and make sure end dates and times come after their start.
                                </p>
                              )}
                              <Input
                                value={c.textbook || ""}
                                onChange={(e) => updateClass(realIdx, { textbook: e.target.value })}
                                placeholder="Textbook (optional)"
                              />
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
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between mt-6">
              <Button variant="ghost" size="sm" className="min-h-11" onClick={back} disabled={step === 0}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                size="sm"
                className="min-h-11 bg-gradient-calm border-0 text-primary-foreground"
                onClick={next}
                disabled={!canContinue || saving}
              >
                {saving
                  ? "Setting up…"
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

export function isOnboardingClassScheduleValid(classInfo: OnboardingClass) {
  const hasDays = classInfo.days.length > 0;
  const hasStartDate = Boolean(classInfo.semesterStartDate);
  const hasEndDate = Boolean(classInfo.semesterEndDate);
  if (hasStartDate !== hasEndDate) return false;
  if (hasDays && (!hasStartDate || !hasEndDate)) return false;
  if (hasStartDate && (!isDateKey(classInfo.semesterStartDate) || !isDateKey(classInfo.semesterEndDate))) return false;
  if (
    classInfo.semesterStartDate
    && classInfo.semesterEndDate
    && classInfo.semesterEndDate < classInfo.semesterStartDate
  ) return false;

  const startTime = normalizeTimeKey(classInfo.time);
  const endTime = normalizeTimeKey(classInfo.endTime);
  if ((classInfo.time && !startTime) || (classInfo.endTime && !endTime)) return false;
  if ((startTime || endTime) && !hasDays) return false;
  if (endTime && !startTime) return false;
  if (startTime && endTime && endTime <= startTime) return false;
  return true;
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
