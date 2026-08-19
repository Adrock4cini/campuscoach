/**
 * Shown right after a syllabus save so the student has one obvious next step:
 * study the class, or prepare for the next real test the syllabus just created.
 * Uses the existing Study Lab route/scope — no new ranking logic.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import { classifyAssessment } from "@/lib/assessments/classification";
import { isPastDateKey } from "@/lib/calendar/dateKey";

export function SyllabusNextStep({
  classId,
  className,
  onDismiss,
}: {
  classId: string;
  className: string;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const { items: exams } = useRealExams(classId);
  const { items: assignments } = useRealAssignments(classId);

  const counts = useMemo(() => {
    let homework = 0;
    let quizzes = 0;
    for (const item of assignments) {
      const type = classifyAssessment({ row: "assignment", title: item.title, meta: (item as { meta?: unknown }).meta });
      if (type === "assignment") homework += 1;
      else quizzes += 1;
    }
    return { homework, quizzes, exams: exams.length };
  }, [assignments, exams]);

  const nextExam = useMemo(
    () => exams.find((exam) => exam.exam_date && !isPastDateKey(exam.exam_date)) ?? null,
    [exams],
  );

  const goStudy = (examId?: string) => {
    const params = new URLSearchParams({ classId });
    if (examId) params.set("examId", examId);
    onDismiss();
    navigate(`/study-lab?${params.toString()}`);
  };

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-card">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-foreground">Syllabus saved to {className}.</h2>
            <p className="mt-1 text-sm text-foreground">
              {counts.homework} assignment{counts.homework === 1 ? "" : "s"} · {counts.quizzes} quiz{counts.quizzes === 1 ? "" : "zes"} · {counts.exams} test{counts.exams === 1 ? "" : "s"} are now on your calendar.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {nextExam
                ? `Campus Companion will rank ${className} material by what your saved test topics, your teacher’s emphasis, and your own results say matters most. Nothing here is a guaranteed test question.`
                : `Study Lab can now use ${className}’s saved dates and topics to focus what you practice first.`}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {nextExam && (
            <Button className="h-11 flex-1" onClick={() => goStudy(nextExam.id)}>
              Prepare for {nextExam.title}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" className="h-11 flex-1" onClick={() => goStudy()}>
            Study this class
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
