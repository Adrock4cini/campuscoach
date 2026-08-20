/**
 * Real exams list — signed-in student view. No demo data.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Calendar, GraduationCap, Trash2, Sparkles, ExternalLink } from "lucide-react";
import { AddExamDialog } from "@/components/real/AddExamDialog";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { useRealExams, daysUntil } from "@/lib/realData/hooks";
import { deleteExam } from "@/lib/realData/exams";
import { toast } from "sonner";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { labelTestReadiness } from "@/lib/intelligence/testReadinessLabel";

export function RealExamsView() {
  const navigate = useNavigate();
  const {
    classes: myClasses,
    loading: classesLoading,
    error: classesError,
    reload: reloadClasses,
  } = useMyClasses();
  const { items, loading, error, reload } = useRealExams();
  const [addOpen, setAddOpen] = useState(false);

  const classNameFor = (id: string | null) => myClasses.find((c) => c.id === id)?.name ?? "Class";
  const timedItems = items.map((exam) => ({ exam, days: daysUntil(exam.exam_date) }));
  const upcomingItems = timedItems.filter(({ days }) => days !== null && Number.isFinite(days) && days >= 0);
  const undatedItems = timedItems.filter(({ days }) => days === null || !Number.isFinite(days));
  const pastItems = timedItems.filter(({ days }) => days !== null && Number.isFinite(days) && days < 0);

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    const ok = await deleteExam(id);
    if (!ok) return toast.error("Couldn't delete");
    toast.success("Deleted");
    window.dispatchEvent(new CustomEvent("real-exams:changed"));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Tests &amp; exams</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {upcomingItems.length} upcoming
            {undatedItems.length > 0 ? ` · ${undatedItems.length} date TBD` : ""}
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
        <div className="space-y-6">
          {[
            { id: "upcoming-exams", label: "Upcoming", entries: upcomingItems },
            { id: "undated-exams", label: "Date not set", entries: undatedItems },
            { id: "past-exams", label: "Past exams", entries: pastItems },
          ].filter((group) => group.entries.length > 0).map((group) => (
            <section key={group.id} aria-labelledby={group.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id={group.id} className="text-sm font-semibold text-foreground">{group.label}</h2>
                <span className="text-xs text-muted-foreground">{group.entries.length}</span>
              </div>
              {group.entries.map(({ exam: e, days }) => {
                const fromCanvas = e.source === "canvas";
                const isPast = days !== null && Number.isFinite(days) && days < 0;
                const dueChip =
                  days === null || !Number.isFinite(days) ? "Date TBD" :
                  days < 0 ? `Past · ${-days}d ago` :
                  days === 0 ? "Today" :
                  `${days}d away`;
                return (
                  <Card key={e.id} className="shadow-card">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-display font-semibold text-foreground">{e.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{classNameFor(e.client_class_id)}</p>
                          {fromCanvas && <Badge variant="outline" className="mt-1 text-[10px]">Canvas</Badge>}
                        </div>
                        <Badge variant="outline" className="text-xs"><Calendar className="h-3 w-3 mr-1" />{dueChip}</Badge>
                        {fromCanvas ? (
                          e.source_url && (
                            <Button variant="ghost" size="icon" className="h-11 w-11" asChild>
                              <a href={e.source_url} target="_blank" rel="noreferrer" aria-label="Open in Canvas">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-muted-foreground hover:text-danger"
                            aria-label={`Delete ${e.title}`}
                            onClick={() => { void remove(e.id, e.title); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {!isPast && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Test readiness</span>
                            <span className="font-medium text-foreground">{labelTestReadiness(e.readiness).label}</span>
                          </div>
                          <Progress value={e.readiness} className="h-2" />
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            {labelTestReadiness(e.readiness).meaning}
                          </p>
                        </div>
                      )}
                      {e.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {e.topics.map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px] border-primary/20 text-primary">{t}</Badge>
                          ))}
                        </div>
                      )}
                      {e.client_class_id && !isPast && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/study-lab?${new URLSearchParams({
                            classId: e.client_class_id!,
                            examId: e.id,
                          }).toString()}`)}
                        >
                          <Sparkles className="h-4 w-4 mr-1.5" /> Study for this exam
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ))}
        </div>
      )}

      <AddExamDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
