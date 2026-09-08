/**
 * Class Command Center — Assignments & Tests.
 *
 * Two compact, expandable sections near the top of a class page. Each row is
 * one line by default: title, when it's due, status, and whether Campus Coach
 * actually has material for it. Expanding reveals the honest detail and the
 * actions for that one item.
 *
 * Semantics that must not drift:
 * - "material" means captures explicitly linked to THIS assignment/test.
 * - completing an assignment is not mastery.
 * - "Not studied yet" flips only on real study-session evidence.
 * - readiness stays a word; no invented numbers.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, Check, ChevronDown, Plus } from "lucide-react";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { useClassWorkSignals } from "@/lib/realData/useClassWorkSignals";
import { AddAssignmentDialog } from "./AddAssignmentDialog";
import { AddExamDialog } from "./AddExamDialog";
import { updateAssignment, type AssignmentStatus, type RealAssignment } from "@/lib/realData/assignments";
import type { RealExam } from "@/lib/realData/exams";
import { useCapture } from "@/contexts/CaptureContext";
import { assignmentStatusLabel, materialSignal, testPrepSignal, type MaterialTone } from "@/lib/dashboard/itemMaterials";
import { labelTestReadiness } from "@/lib/intelligence/testReadinessLabel";
import { cn } from "@/lib/utils";

const toneClass: Record<MaterialTone, string> = {
  calm: "text-muted-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning",
};

function whenChip(dateStr: string | null): { text: string; urgent: boolean } {
  const days = daysUntil(dateStr);
  if (days === null) return { text: "No date", urgent: false };
  if (days < 0) return { text: `${-days}d overdue`, urgent: true };
  if (days === 0) return { text: "Today", urgent: true };
  if (days === 1) return { text: "Tomorrow", urgent: false };
  return { text: `In ${days}d`, urgent: false };
}

/** Overdue and upcoming rise; completed work recedes to the bottom. */
export function orderAssignments(items: RealAssignment[]): RealAssignment[] {
  return [...items].sort((a, b) => {
    const aDone = a.status === "complete" ? 1 : 0;
    const bDone = b.status === "complete" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
  });
}

export function RealClassAssignmentsExams({ classId }: { classId: string }) {
  const {
    items: assignments,
    loading: assignmentsLoading,
    error: assignmentsError,
    reload: reloadAssignments,
  } = useRealAssignments(classId);
  const {
    items: exams,
    loading: examsLoading,
    error: examsError,
    reload: reloadExams,
  } = useRealExams(classId);
  const { signals } = useClassWorkSignals(classId);
  const { open: openCapture } = useCapture();
  const [addA, setAddA] = useState(false);
  const [addE, setAddE] = useState(false);
  const [openAssignments, setOpenAssignments] = useState(true);
  const [openExams, setOpenExams] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const ordered = useMemo(() => orderAssignments(assignments), [assignments]);
  const openCount = assignments.filter((a) => a.status !== "complete").length;

  const toggleComplete = async (assignment: RealAssignment) => {
    const next: AssignmentStatus = assignment.status === "complete" ? "not_started" : "complete";
    const updated = await updateAssignment(assignment.id, { status: next });
    if (!updated) {
      toast.error("Couldn't update this assignment");
      return;
    }
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  return (
    <div className="space-y-3">
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <SectionHeader
            title="Assignments"
            count={openCount}
            countLabel="open"
            expanded={openAssignments}
            onToggle={() => setOpenAssignments((v) => !v)}
            onAdd={() => setAddA(true)}
          />
          {openAssignments && (
            <div className="border-t border-border/40 px-3 pb-3 pt-1">
              {assignmentsLoading && assignments.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">Loading assignments…</p>
              ) : assignmentsError ? (
                <button className="py-3 text-xs text-primary" onClick={() => void reloadAssignments()}>
                  Couldn't load assignments · Try again
                </button>
              ) : ordered.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No assignments yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {ordered.map((assignment) => {
                    const linked = signals.assignmentMaterials[assignment.id] ?? 0;
                    const material = materialSignal(linked, signals.classCaptureCount);
                    const when = whenChip(assignment.due_date);
                    const done = assignment.status === "complete";
                    const isOpen = expanded === `a-${assignment.id}`;
                    return (
                      <li
                        key={assignment.id}
                        className={cn(
                          "rounded-2xl border border-border/50 bg-background/30",
                          done && "opacity-60",
                        )}
                      >
                        <div className="flex items-center">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : `a-${assignment.id}`)}
                          className="flex min-h-[52px] w-full items-center gap-2 px-3 py-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm text-foreground", done && "line-through")}>
                              {assignment.title}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                              <span className={when.urgent && !done ? "text-danger" : "text-muted-foreground"}>
                                {when.text}
                              </span>
                              <span className="text-muted-foreground">{assignmentStatusLabel(assignment.status)}</span>
                              <span className={toneClass[material.tone]}>{material.text}</span>
                            </span>
                          </span>
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={done ? `Mark ${assignment.title} not done` : `Mark ${assignment.title} complete`}
                          onClick={() => void toggleComplete(assignment)}
                          className={cn(
                            "mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60",
                            done ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </button>
                        </div>


                        {isOpen && (
                          <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
                            {material.needsMaterial ? (
                              <p className="text-xs text-muted-foreground">
                                {linked === 0 && signals.classCaptureCount > 0
                                  ? "Nothing is attached to this assignment yet — only general class material."
                                  : "Nothing captured for this assignment yet."}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Campus Coach has {material.text.toLowerCase()} attached to this assignment.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9"
                                onClick={() => openCapture(undefined, { classId, assignmentId: assignment.id })}
                              >
                                <Camera className="mr-1.5 h-3.5 w-3.5" /> Scan
                              </Button>
                              <Button asChild size="sm" variant="ghost" className="h-9 text-primary">
                                <Link to={`/assignments/${encodeURIComponent(assignment.id)}`}>Get help</Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9"
                                onClick={() => void toggleComplete(assignment)}
                              >
                                <Check className="mr-1.5 h-3.5 w-3.5" />
                                {done ? "Mark not done" : "Mark complete"}
                              </Button>
                            </div>
                            {done && (
                              <p className="text-[11px] text-muted-foreground">
                                Turned in — that's the task done, not the topic learned.
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <SectionHeader
            title="Tests"
            count={exams.length}
            countLabel="scheduled"
            expanded={openExams}
            onToggle={() => setOpenExams((v) => !v)}
            onAdd={() => setAddE(true)}
          />
          {openExams && (
            <div className="border-t border-border/40 px-3 pb-3 pt-1">
              {examsLoading && exams.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">Loading tests…</p>
              ) : examsError ? (
                <button className="py-3 text-xs text-primary" onClick={() => void reloadExams()}>
                  Couldn't load tests · Try again
                </button>
              ) : exams.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No tests yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {exams.map((exam: RealExam) => {
                    const linked = signals.examMaterials[exam.id] ?? 0;
                    const sessions = signals.examStudySessions[exam.id] ?? 0;
                    const prep = testPrepSignal({
                      linkedCount: linked,
                      classCount: signals.classCaptureCount,
                      studySessions: sessions,
                      readiness: exam.readiness,
                    });
                    const when = whenChip(exam.exam_date);
                    const isOpen = expanded === `e-${exam.id}`;
                    return (
                      <li key={exam.id} className="rounded-2xl border border-border/50 bg-background/30">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : `e-${exam.id}`)}
                          className="flex min-h-[52px] w-full items-center gap-2 px-3 py-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">{exam.title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                              <span className={when.urgent ? "text-warning" : "text-muted-foreground"}>{when.text}</span>
                              <span
                                className={toneClass[prep.tone]}
                                title={sessions > 0 ? labelTestReadiness(exam.readiness).meaning : undefined}
                              >
                                {prep.text}
                              </span>
                              {linked > 0 && (
                                <span className="text-muted-foreground">
                                  {linked === 1 ? "1 material" : `${linked} materials`}
                                </span>
                              )}
                            </span>
                          </span>
                          {exam.source === "syllabus" && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">Syllabus</Badge>
                          )}
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                            aria-hidden
                          />
                        </button>

                        {isOpen && (
                          <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
                            {exam.topics.length > 0 && (
                              <p className="text-xs text-muted-foreground">Covers: {exam.topics.join(", ")}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {sessions > 0
                                ? `You've studied for this test ${sessions === 1 ? "once" : `${sessions} times`}. ${labelTestReadiness(exam.readiness).meaning}`
                                : linked > 0
                                  ? "Material is attached, but you haven't studied for this test yet."
                                  : "Add what this test covers so Campus Coach can build practice from it."}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild size="sm" variant="outline" className="h-9">
                                <Link to={`/study-lab?classId=${encodeURIComponent(classId)}&examId=${encodeURIComponent(exam.id)}`}>
                                  {prep.cta === "Add material" ? "Prepare" : prep.cta}
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9"
                                onClick={() => openCapture(undefined, { classId })}
                              >
                                <Camera className="mr-1.5 h-3.5 w-3.5" /> Add material
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddAssignmentDialog open={addA} onOpenChange={setAddA} defaultClientClassId={classId} />
      <AddExamDialog open={addE} onOpenChange={setAddE} defaultClientClassId={classId} />
    </div>
  );
}

function SectionHeader({
  title,
  count,
  countLabel,
  expanded,
  onToggle,
  onAdd,
}: {
  title: string;
  count: number;
  countLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-11 flex-1 items-center gap-2 text-left"
      >
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
        <span className="font-display font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">
          {count} {countLabel}
        </span>
      </button>
      <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={onAdd}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
