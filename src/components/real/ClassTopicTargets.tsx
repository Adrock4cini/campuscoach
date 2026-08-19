/**
 * Syllabus topics as study targets.
 *
 * The syllabus tells Campus Companion what is coming; it never contains
 * teachable content, so this card only shows the student's own stated topics
 * and points them at capturing real class material. Grounded teaching and
 * quizzing still require captures.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCapture } from "@/contexts/CaptureContext";
import { useRealExams } from "@/lib/realData/hooks";
import { buildSyllabusTopicTargets } from "@/lib/syllabus";
import { getCapturesForClass } from "@/lib/supabase/capturePersistence";

export function ClassTopicTargets({
  classId,
  className,
  schedule,
}: {
  classId: string;
  className: string;
  schedule?: { date: string; topic: string; dueItems?: string[] }[];
}) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const { items: exams } = useRealExams(classId);
  const [hasMaterial, setHasMaterial] = useState(false);

  useEffect(() => {
    let active = true;
    void getCapturesForClass(classId, 1)
      .then((captures) => { if (active) setHasMaterial(captures.length > 0); })
      .catch(() => { if (active) setHasMaterial(false); });
    return () => { active = false; };
  }, [classId]);

  const targets = useMemo(
    () => buildSyllabusTopicTargets({ exams, schedule, limit: 8 }),
    [exams, schedule],
  );

  if (targets.length === 0) return null;

  return (
    <Card className="shadow-card border-primary/20">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Target className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-foreground">Topics coming up in {className}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {hasMaterial
                ? "These come straight from your syllabus. Study Lab focuses your saved class material on them first."
                : "I know what topics are coming; add class material so I can teach and quiz you accurately."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {targets.map((target) => (
            <Badge
              key={`${target.source}-${target.topic}`}
              variant="outline"
              className={target.source === "exam" ? "border-primary/30 text-primary" : ""}
            >
              {target.topic}
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-11 flex-1" onClick={() => openCapture(undefined, classId)}>
            <Camera className="mr-1.5 h-4 w-4" /> Add class material
          </Button>
          {hasMaterial && (
            <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(`/study-lab?classId=${classId}`)}>
              Study these topics
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
