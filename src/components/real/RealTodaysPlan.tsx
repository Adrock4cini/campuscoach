/**
 * Real dashboard agenda — the student's next real class, assignment, or exam.
 * Everything here is class-bound and sourced from the signed-in student's
 * existing class, assignment, and exam records.
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  ScanLine,
} from "lucide-react";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import type { ClassInfo } from "@/data/demo";
import { useCapture } from "@/contexts/CaptureContext";
import { buildDashboardAgenda, type DashboardAgendaItem as AgendaItem } from "@/lib/calendar/dashboardAgenda";

export function RealTodaysPlan({ classes = [], now = new Date() }: { classes?: ClassInfo[]; now?: Date }) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
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
  const agenda = useMemo(
    () => buildDashboardAgenda(classes, assignments, exams, now),
    [assignments, classes, exams, now],
  );
  const loading = assignmentsLoading || examsLoading;
  const error = assignmentsError || examsError;

  const openItem = (item: AgendaItem) => {
    if (item.kind === "class") {
      openCapture(undefined, item.classId);
      return;
    }
    if (item.kind === "exam" && item.classId) {
      navigate(`/study-lab?classId=${encodeURIComponent(item.classId)}&examId=${encodeURIComponent(item.id)}`);
      return;
    }
    const query = item.classId
      ? `?classId=${encodeURIComponent(item.classId)}&assignmentId=${encodeURIComponent(item.id)}`
      : "";
    navigate(`/assignments${query}`);
  };

  return (
    <section className="space-y-2.5" aria-labelledby="dashboard-agenda-title">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="dashboard-agenda-title" className="font-display text-xl font-semibold text-foreground">
          Up next
        </h2>
        <Link
          to="/calendar"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          View calendar
          <CalendarDays className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/40 bg-background/30 p-5 text-xs text-muted-foreground">
          Loading your schedule…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Couldn’t load your schedule</p>
          <p className="mt-1">Your assignments and exams were not deleted.</p>
          <button
            className="mt-2 min-h-11 font-medium text-primary"
            onClick={() => { void reloadAssignments(); void reloadExams(); }}
          >
            Try again
          </button>
        </div>
      ) : agenda.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Nothing scheduled yet</p>
          <p className="mt-1">Import a syllabus to turn class dates and deadlines into your daily plan.</p>
          <Link to="/onboarding?import=syllabus" className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            Import syllabus
          </Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-border/50 bg-card/55 backdrop-blur-md">
          {agenda.map((item) => {
            const Icon = item.kind === "exam" ? GraduationCap : item.kind === "assignment" ? FileText : BookOpen;
            const actionLabel = item.kind === "class"
              ? `Capture notes for ${item.className}`
              : item.kind === "exam"
                ? `Study for ${item.title}`
                : `Open ${item.title}`;
            return (
              <li key={`${item.kind}-${item.id}`} className="border-b border-border/40 last:border-b-0">
                <button
                  type="button"
                  aria-label={actionLabel}
                  onClick={() => openItem(item)}
                  className="group flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    item.kind === "exam"
                      ? "bg-accent/15 text-accent"
                      : item.kind === "assignment"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <span className="truncate">{item.className}</span>
                      <span aria-hidden="true">·</span>
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.meta}</span>
                      {item.kind === "exam" && <span className="shrink-0 text-primary">· {item.readiness}% ready</span>}
                    </span>
                  </span>
                  {item.kind === "class" ? (
                    <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-medium text-primary">
                      <ScanLine className="h-3.5 w-3.5" />
                      Capture
                    </span>
                  ) : item.kind === "exam" ? (
                    <span className="hidden min-[390px]:inline-flex min-h-11 shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-medium text-primary">
                      Study
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
