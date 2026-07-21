/**
 * Real assignments list — signed-in student view. No demo data.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Clock, ListChecks, CheckCircle2, Trash2 } from "lucide-react";
import { AddAssignmentDialog } from "@/components/real/AddAssignmentDialog";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealAssignments, daysUntil } from "@/lib/realData/hooks";
import { updateAssignment, deleteAssignment, type AssignmentStatus } from "@/lib/realData/assignments";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { useSearchParams } from "react-router-dom";

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

const PRIORITY_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-danger/10 text-danger",
};

export function RealAssignmentsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassId = searchParams.get("classId") || undefined;
  const selectedAssignmentId = searchParams.get("assignmentId") || undefined;
  const {
    classes: myClasses,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const { items, loading, error, reload } = useRealAssignments(selectedClassId);
  const [addOpen, setAddOpen] = useState(false);

  const classNameFor = (id: string | null) => myClasses.find((c) => c.id === id)?.name ?? "Class";

  const toggleStatus = async (id: string, next: AssignmentStatus) => {
    const updated = await updateAssignment(id, { status: next });
    if (!updated) {
      toast.error("Couldn’t update assignment");
      return;
    }
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  const remove = async (id: string) => {
    const ok = await deleteAssignment(id);
    if (!ok) return toast.error("Couldn't delete");
    toast.success("Deleted");
    window.dispatchEvent(new CustomEvent("real-assignments:changed"));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Assignments</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {items.filter((a) => a.status !== "complete").length} active
            {selectedClassId && (
              <button
                type="button"
                className="ml-2 text-primary hover:underline"
                onClick={() => setSearchParams({})}
              >
                Show all
              </button>
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={classesLoading || Boolean(classesError) || myClasses.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {classesLoading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading classes…</p>
      ) : classesError ? (
        <ClassesLoadError onRetry={() => void reloadClasses()} />
      ) : myClasses.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Add a class first so you can attach assignments to it.
        </CardContent></Card>
      ) : loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
      ) : error ? (
        <Card><CardContent className="p-8 text-center space-y-3">
          <p className="font-medium text-foreground">Couldn’t load assignments</p>
          <p className="text-sm text-muted-foreground">Your assignments were not deleted.</p>
          <Button size="sm" variant="outline" onClick={() => void reload()}>Try again</Button>
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <ListChecks className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium text-foreground">No assignments yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first assignment to start tracking due dates and progress.</p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add assignment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((a) => {
            const days = daysUntil(a.due_date);
            const dueChip =
              days === null ? "No date" :
              days < 0 ? `${-days}d overdue` :
              days === 0 ? "Due today" :
              days === 1 ? "Due tomorrow" :
              `Due in ${days}d`;
            const dueTone =
              days === null ? "text-muted-foreground" :
              days <= 1 ? "text-danger" :
              days <= 3 ? "text-warning" : "text-muted-foreground";
            return (
              <Card key={a.id} className={`shadow-card ${a.id === selectedAssignmentId ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <button
                    onClick={() => toggleStatus(a.id, a.status === "complete" ? "not_started" : "complete")}
                    className="mt-0.5 shrink-0"
                    aria-label="Toggle complete"
                  >
                    <CheckCircle2 className={`h-5 w-5 ${a.status === "complete" ? "text-success" : "text-muted-foreground/40"}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${a.status === "complete" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {a.title}
                      </p>
                      <Badge variant="secondary" className={`text-[10px] ${PRIORITY_TONE[a.priority] ?? ""}`}>
                        {a.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{classNameFor(a.client_class_id)}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className={dueTone}><Clock className="h-3 w-3 inline mr-0.5" />{dueChip}</span>
                      <span className="text-muted-foreground">⏱ {a.estimated_minutes}m</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Select value={a.status} onValueChange={(v: AssignmentStatus) => toggleStatus(a.id, v)}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger" onClick={() => remove(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddAssignmentDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
