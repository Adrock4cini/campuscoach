/**
 * Real exams list — signed-in student view. No demo data.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Calendar, GraduationCap, Trash2 } from "lucide-react";
import { AddExamDialog } from "@/components/real/AddExamDialog";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealExams, daysUntil } from "@/lib/realData/hooks";
import { deleteExam } from "@/lib/realData/exams";
import { toast } from "sonner";

export function RealExamsView() {
  const { classes: myClasses } = useMyClasses();
  const { items, loading, error, reload } = useRealExams();
  const [addOpen, setAddOpen] = useState(false);

  const classNameFor = (id: string | null) => myClasses.find((c) => c.id === id)?.name ?? "Class";

  const remove = async (id: string) => {
    const ok = await deleteExam(id);
    if (!ok) return toast.error("Couldn't delete");
    toast.success("Deleted");
    window.dispatchEvent(new CustomEvent("real-exams:changed"));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Exams</h1>
          <p className="text-xs text-muted-foreground mt-1">{items.length} upcoming</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={myClasses.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {myClasses.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Add a class first so you can schedule exams for it.
        </CardContent></Card>
      ) : loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
      ) : error ? (
        <Card><CardContent className="p-8 text-center space-y-3">
          <p className="font-medium text-foreground">Couldn’t load exams</p>
          <p className="text-sm text-muted-foreground">Your exams were not deleted.</p>
          <Button size="sm" variant="outline" onClick={() => void reload()}>Try again</Button>
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <GraduationCap className="h-8 w-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium text-foreground">No exams yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first exam to track topics and readiness.</p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add exam
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((e) => {
            const days = daysUntil(e.exam_date);
            const dueChip =
              days === null ? "Date TBD" :
              days < 0 ? `${-days}d ago` :
              days === 0 ? "Today" :
              `${days}d away`;
            return (
              <Card key={e.id} className="shadow-card">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{classNameFor(e.client_class_id)}</p>
                    </div>
                    <Badge variant="outline" className="text-xs"><Calendar className="h-3 w-3 mr-1" />{dueChip}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger" onClick={() => remove(e.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Readiness</span>
                      <span className="font-medium text-foreground">{e.readiness}%</span>
                    </div>
                    <Progress value={e.readiness} className="h-2" />
                  </div>
                  {e.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {e.topics.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px] border-primary/20 text-primary">{t}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddExamDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
