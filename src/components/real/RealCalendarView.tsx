import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { useCapture } from "@/contexts/CaptureContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import type { RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import type { ClassInfo } from "@/data/demo";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { toDateKey } from "@/lib/calendar/dateKey";

type CalendarItem =
  | { kind: "class"; id: string; classId: string; className: string; title: string; time: string }
  | { kind: "assignment"; id: string; classId: string; className: string; title: string; time: string }
  | { kind: "exam"; id: string; classId: string; className: string; title: string; time: string; readiness: number };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function itemsForDate(
  date: Date,
  classes: ClassInfo[],
  assignments: RealAssignment[],
  exams: RealExam[],
): CalendarItem[] {
  const dateKey = toDateKey(date);
  const classNameFor = (id: string | null) => classes.find((item) => item.id === id)?.name ?? "Class";

  const classItems: CalendarItem[] = classes.flatMap((item) => {
    const datedTopic = item.schedule?.find((entry) => entry.date === dateKey);
    if (!datedTopic && !item.days.includes(DAY_LABELS[date.getDay()])) return [];
    return [{
      kind: "class" as const,
      id: `class-${item.id}-${dateKey}`,
      classId: item.id,
      className: item.name,
      title: datedTopic?.topic ? `${item.name}: ${datedTopic.topic}` : `${item.name} class`,
      time: item.time || "Class meeting",
    }];
  });

  const assignmentItems: CalendarItem[] = assignments
    .filter((item) => item.due_date === dateKey)
    .map((item) => ({
      kind: "assignment",
      id: item.id,
      classId: item.client_class_id ?? "",
      className: classNameFor(item.client_class_id),
      title: item.title,
      time: "Due today",
    }));

  const examItems: CalendarItem[] = exams
    .filter((item) => item.exam_date === dateKey)
    .map((item) => ({
      kind: "exam",
      id: item.id,
      classId: item.client_class_id ?? "",
      className: classNameFor(item.client_class_id),
      title: item.title,
      time: "Exam day",
      readiness: item.readiness,
    }));

  return [...examItems, ...assignmentItems, ...classItems];
}

function formatSelectedDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function RealCalendarView() {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const {
    classes,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const {
    items: assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    reload: reloadAssignments,
  } = useRealAssignments();
  const {
    items: exams,
    loading: examsLoading,
    error: examsError,
    reload: reloadExams,
  } = useRealExams();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [month, setMonth] = useState<Date>(() => new Date());

  const selectedItems = useMemo(
    () => itemsForDate(selectedDate, classes, assignments, exams),
    [assignments, classes, exams, selectedDate],
  );
  const examDates = useMemo(
    () => new Set(exams.flatMap((item) => item.exam_date ? [item.exam_date] : [])),
    [exams],
  );
  const assignmentDates = useMemo(
    () => new Set(assignments.flatMap((item) => item.due_date ? [item.due_date] : [])),
    [assignments],
  );
  const loading = classesLoading || assignmentsLoading || examsLoading;
  const dataError = assignmentsError || examsError;

  if (classesError) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <ClassesLoadError onRetry={() => void reloadClasses()} />
      </div>
    );
  }

  const handleItem = (item: CalendarItem) => {
    if (item.kind === "class") {
      openCapture(undefined, item.classId);
      return;
    }
    if (item.kind === "exam" && item.classId) {
      navigate(`/study-lab?classId=${encodeURIComponent(item.classId)}&examId=${encodeURIComponent(item.id)}`);
      return;
    }
    const classQuery = item.classId ? `?classId=${encodeURIComponent(item.classId)}&assignmentId=${encodeURIComponent(item.id)}` : "";
    navigate(`/assignments${classQuery}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-primary/90 mb-1.5">
            <Sparkles className="h-3 w-3" /> Academic calendar
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">
            See what’s coming
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Classes, assignments, and exams in one place.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => navigate("/onboarding?import=syllabus")}
        >
          <Plus className="h-4 w-4 mr-1" />
          <span className="hidden min-[390px]:inline">Import </span>syllabus
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <Card className="border-border/40 shadow-card overflow-hidden">
          <CardContent className="p-2 sm:p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              month={month}
              onMonthChange={setMonth}
              className="mx-auto w-fit"
              modifiers={{
                hasExam: (date) => examDates.has(toDateKey(date)),
                hasAssignment: (date) => assignmentDates.has(toDateKey(date)),
              }}
              modifiersClassNames={{
                hasExam: "ring-1 ring-accent/80 ring-inset font-semibold",
                hasAssignment: "bg-primary/10 font-medium",
              }}
            />
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/40 px-2 pt-3 pb-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary/70" /> Assignment</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full ring-1 ring-accent" /> Exam</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-card">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Your day</p>
                <h2 className="font-display text-xl font-semibold text-foreground mt-0.5">
                  {formatSelectedDate(selectedDate)}
                </h2>
              </div>
              {toDateKey(selectedDate) !== toDateKey(new Date()) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const today = new Date();
                    setSelectedDate(today);
                    setMonth(today);
                  }}
                >
                  Today
                </Button>
              )}
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading your schedule…</p>
            ) : dataError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center space-y-2">
                <p className="text-sm font-medium text-foreground">Part of your schedule couldn’t load.</p>
                <p className="text-xs text-muted-foreground">Nothing was deleted.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { void reloadAssignments(); void reloadExams(); }}
                >
                  Try again
                </Button>
              </div>
            ) : selectedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-5 py-9 text-center">
                <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium text-foreground">Nothing scheduled</p>
                <p className="mt-1 text-xs text-muted-foreground">A clear day—or import a syllabus to fill in deadlines.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedItems.map((item) => {
                  const Icon = item.kind === "exam" ? GraduationCap : item.kind === "assignment" ? FileText : BookOpen;
                  const actionLabel = item.kind === "exam"
                    ? `Study for ${item.title}`
                    : item.kind === "assignment"
                    ? `Open ${item.title}`
                    : `Capture notes for ${item.className}`;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      aria-label={actionLabel}
                      onClick={() => handleItem(item)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/20 p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        item.kind === "exam" ? "bg-accent/15 text-accent" : item.kind === "assignment" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{item.className}</span>
                          <span aria-hidden="true">·</span>
                          <Clock className="h-3 w-3" />
                          <span>{item.time}</span>
                          {item.kind === "exam" && <span>· {item.readiness}% ready</span>}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
