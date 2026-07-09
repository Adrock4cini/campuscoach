/**
 * Real "Today's Plan" — surfaces the student's next real assignments and
 * exams sorted by date. No demo data.
 *
 * UX polish: bigger tap rows, calmer hierarchy, mobile-friendly.
 * Functionality unchanged.
 */
import { Link } from "react-router-dom";
import { Clock, Calendar, CheckCircle2 } from "lucide-react";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { updateAssignment, type AssignmentStatus } from "@/lib/realData/assignments";
import { cn } from "@/lib/utils";

export function RealTodaysPlan() {
  const { items: assignments } = useRealAssignments();
  const { items: exams } = useRealExams();

  const openAssignments = assignments.filter((a) => a.status !== "complete");
  const upcomingExams = exams.filter((e) => {
    const d = daysUntil(e.exam_date);
    return d === null || d >= 0;
  });

  const toggle = async (id: string, status: AssignmentStatus) => {
    await updateAssignment(id, { status: status === "complete" ? "not_started" : "complete" });
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  const empty = openAssignments.length === 0 && upcomingExams.length === 0;

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-foreground/80">Today's plan</h2>
        {!empty && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {openAssignments.length + upcomingExams.length} up next
          </span>
        )}
      </div>

      {empty ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-5 text-xs text-muted-foreground">
          Nothing scheduled yet. Add an{" "}
          <Link to="/assignments" className="text-primary hover:underline">assignment</Link> or{" "}
          <Link to="/exams" className="text-primary hover:underline">exam</Link> to build your plan.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {openAssignments.slice(0, 4).map((a) => {
            const days = daysUntil(a.due_date);
            const chip =
              days === null ? "No date" :
              days < 0 ? `${-days}d overdue` :
              days === 0 ? "Today" :
              days === 1 ? "Tomorrow" :
              `${days}d`;
            const tone =
              days === null ? "text-muted-foreground" :
              days <= 1 ? "text-danger" :
              days <= 3 ? "text-warning" : "text-muted-foreground";
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 hover:bg-card/70 hover:border-border/70 pl-2 pr-4 py-2.5 min-h-[56px] transition-colors"
              >
                <button
                  onClick={() => toggle(a.id, a.status)}
                  aria-label="Toggle complete"
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-success"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </button>
                <span className="flex-1 text-sm text-foreground truncate">{a.title}</span>
                <span className={cn("text-[11px] tabular-nums whitespace-nowrap", tone)}>
                  <Clock className="h-3 w-3 inline mr-0.5" />
                  {chip}
                </span>
              </li>
            );
          })}
          {upcomingExams.slice(0, 3).map((e) => {
            const days = daysUntil(e.exam_date);
            const chip =
              days === null ? "Date TBD" :
              days === 0 ? "Today" : `${days}d away`;
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/50 hover:bg-card/70 hover:border-border/70 px-4 py-3 min-h-[56px] transition-colors"
              >
                <span className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-primary" />
                </span>
                <span className="flex-1 text-sm text-foreground truncate">
                  <span className="text-muted-foreground">Exam · </span>{e.title}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{chip}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
