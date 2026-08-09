import { useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClassForm } from "@/components/real/ClassForm";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import { currentAcademicTerm } from "@/lib/onboarding/options";
import {
  createClass,
  createStableClassId,
  emptyClassEditorValues,
  updateClass,
  type ClassEditorValues,
} from "@/lib/realData/classes";
import { browserTimeZone, normalizeTimeKey, normalizeWeekdays } from "@/lib/calendar/classSchedule";
import type { ClassInfo } from "@/data/demo";

function valuesForClass(classInfo: ClassInfo, fallbackTerm: string): ClassEditorValues {
  return {
    name: classInfo.name,
    code: classInfo.courseCode ?? "",
    section: classInfo.section ?? "",
    professor: classInfo.professor === "TBD" ? "" : classInfo.professor,
    location: classInfo.location,
    term: classInfo.term || fallbackTerm,
    weekdays: normalizeWeekdays(classInfo.days),
    startTime: classInfo.startTimeKey || normalizeTimeKey(classInfo.time),
    endTime: classInfo.endTimeKey || normalizeTimeKey(classInfo.endTime),
    semesterStartDate: classInfo.semesterStartDate ?? "",
    semesterEndDate: classInfo.semesterEndDate ?? "",
    timeZone: classInfo.timeZone || browserTimeZone(),
  };
}

export default function ClassEditorPage() {
  const { classId } = useParams();
  const editing = Boolean(classId);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { classes, loading, error, reload } = useMyClasses();
  const stableDraftId = useRef(createStableClassId());
  const classInfo = editing ? classes.find((item) => item.id === classId) : undefined;
  const defaultTerm = profile?.term || currentAcademicTerm();
  const initialValues = useMemo(
    () => classInfo ? valuesForClass(classInfo, defaultTerm) : emptyClassEditorValues(defaultTerm),
    [classInfo, defaultTerm],
  );

  const cancelDestination = classInfo ? `/classes/${classInfo.id}` : "/classes";

  if (!user) {
    return (
      <Card className="mx-auto mt-8 max-w-lg border-primary/20 shadow-card">
        <CardContent className="space-y-4 p-8 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-semibold">Create an account to add your classes</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your schedule and class material stay private to your account.</p>
          </div>
          <Button asChild><Link to="/signup">Create account</Link></Button>
        </CardContent>
      </Card>
    );
  }

  if (editing && loading && !classInfo) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading your class…</p>;
  }

  if (editing && error && !classInfo) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <ClassesLoadError onRetry={() => void reload()} />
      </div>
    );
  }

  if (editing && !classInfo) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Class not found</h1>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/classes")}>Back to classes</Button>
      </div>
    );
  }

  const save = async (values: ClassEditorValues) => {
    const identity = classInfo?.uuid
      ? await updateClass(user.id, classInfo.uuid, values)
      : await createClass(user.id, stableDraftId.current, values);

    window.dispatchEvent(new CustomEvent("coach:refresh"));
    toast.success(classInfo ? "Class updated" : "Class added");
    navigate(`/classes/${identity.clientClassId}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={classInfo ? `Back to ${classInfo.name}` : "Back to classes"}
          onClick={() => navigate(cancelDestination, { replace: true })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 pt-1">
          <h1 className="font-display text-2xl font-semibold text-foreground md:text-3xl">
            {classInfo ? "Edit class" : "Add a class"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {classInfo ? `Update ${classInfo.name} without disconnecting its work.` : "Set up one class without restarting onboarding."}
          </p>
        </div>
      </div>

      {classInfo?.source === "canvas" && (
        <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>Canvas may refresh the course name or professor. Your term dates and meeting schedule stay saved here.</p>
        </div>
      )}

      {classInfo && error && (
        <div role="status" className="rounded-xl border border-warning/25 bg-warning/5 p-3 text-sm text-muted-foreground">
          We couldn’t refresh this class, so the editor is keeping the last details loaded. Your typed changes are still here.
        </div>
      )}

      <Card className="rounded-[26px] border-border/50 shadow-card">
        <CardContent className="p-5 sm:p-7">
          <ClassForm
            mode={classInfo ? "edit" : "create"}
            initialValues={initialValues}
            onSubmit={save}
            onCancel={() => navigate(cancelDestination, { replace: true })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
