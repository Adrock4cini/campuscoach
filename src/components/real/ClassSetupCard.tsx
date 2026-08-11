/**
 * ClassSetupCard — one glance at what this class still needs.
 * Syllabus / next test / material coverage → one primary action.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  FileText,
  Camera,
  Calendar,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { ClassInfo } from "@/data/demo";
import { useRealAssignments, useRealExams, daysUntil } from "@/lib/realData/hooks";
import { getCapturesForClass } from "@/lib/supabase/capturePersistence";
import { useCapture } from "@/contexts/CaptureContext";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  detail: string;
};

type PrimaryAction = {
  label: string;
  onClick: () => void;
  hint: string;
};

export function ClassSetupCard({
  classInfo,
}: {
  classInfo: ClassInfo;
}) {
  const navigate = useNavigate();
  const { open: openCapture } = useCapture();
  const { items: assignments, loading: assignmentsLoading } = useRealAssignments(classInfo.id);
  const { items: exams, loading: examsLoading } = useRealExams(classInfo.id);
  const [captureCount, setCaptureCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getCapturesForClass(classInfo.id, 40);
        if (!cancelled) setCaptureCount(rows.length);
      } catch {
        if (!cancelled) setCaptureCount(0);
      }
    })();
    const refresh = () => {
      void getCapturesForClass(classInfo.id, 40)
        .then((rows) => setCaptureCount(rows.length))
        .catch(() => setCaptureCount(0));
    };
    window.addEventListener("capture:committed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("capture:committed", refresh);
    };
  }, [classInfo.id]);

  const hasSyllabus = (classInfo.schedule?.length ?? 0) > 0;
  const openAssignments = assignments.filter((a) => a.status !== "complete");
  const nextExam = useMemo(() => {
    const upcoming = exams
      .map((e) => ({ exam: e, days: daysUntil(e.exam_date) }))
      .filter((row) => row.days === null || row.days >= 0)
      .sort((a, b) => {
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });
    return upcoming[0] ?? null;
  }, [exams]);

  const materialReady = (captureCount ?? 0) > 0;
  const examSoon =
    nextExam?.days !== null &&
    nextExam?.days !== undefined &&
    nextExam.days <= 14;

  const checklist: ChecklistItem[] = [
    {
      id: "syllabus",
      label: "Syllabus & calendar",
      done: hasSyllabus,
      detail: hasSyllabus
        ? `${classInfo.schedule!.length} dated topics on your calendar`
        : "Still need your syllabus so dates and topics load in",
    },
    {
      id: "exams",
      label: "Upcoming tests",
      done: exams.length > 0,
      detail: nextExam
        ? nextExam.days === null
          ? `${nextExam.exam.title} · date TBD`
          : nextExam.days === 0
            ? `${nextExam.exam.title} · today`
            : `${nextExam.exam.title} · in ${nextExam.days} day${nextExam.days === 1 ? "" : "s"}`
        : "Add at least one test date so we can coach you toward it",
    },
    {
      id: "material",
      label: "Notes & captures",
      done: materialReady,
      detail:
        captureCount === null
          ? "Checking what you’ve captured…"
          : materialReady
            ? `${captureCount} item${captureCount === 1 ? "" : "s"} in Class Memory`
            : examSoon
              ? "Test is close — scan notes or a lecture so practice has something real"
              : "Photo notes, slides, or a quick professor hint to feed Study Lab",
    },
  ];

  const doneCount = checklist.filter((item) => item.done).length;

  const primary: PrimaryAction = !hasSyllabus
    ? {
        label: "Add syllabus",
        hint: "One scan fills calendar dates and class topics.",
        onClick: () => navigate("/onboarding?import=syllabus"),
      }
    : exams.length === 0
      ? {
          label: "Add a test date",
          hint: "We’ll track readiness toward the real deadline.",
          onClick: () => {
            const el = document.getElementById("class-assignments-exams");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }
    : examSoon && !materialReady
      ? {
          label: "Scan notes for this test",
          hint: "Campus Brain turns pages into study cards for the exam ahead.",
          onClick: () => openCapture("scan-material", classInfo.id),
        }
    : openAssignments.length > 0
      ? {
          label: "Work an open assignment",
          hint: `${openAssignments.length} still open — mark complete when done, or get help.`,
          onClick: () => {
            const el = document.getElementById("class-assignments-exams");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }
      : {
          label: "Quick capture",
          hint: "Keep Class Memory growing — notes, hints, or book pages.",
          onClick: () => openCapture(undefined, classInfo.id),
        };

  const loading = assignmentsLoading || examsLoading;

  return (
    <Card className="shadow-card border-primary/25 bg-gradient-to-br from-primary/10 via-background to-accent/5 overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
              Class coach
            </p>
            <h3 className="font-display font-semibold text-foreground text-lg leading-tight">
              {doneCount === checklist.length
                ? "This class is set up"
                : "What this class still needs"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {loading
                ? "Loading your deadlines…"
                : `${doneCount} of ${checklist.length} foundations in place`}
            </p>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <ul className="space-y-2.5">
          {checklist.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex gap-3 rounded-xl border px-3 py-2.5",
                item.done
                  ? "border-success/25 bg-success/5"
                  : "border-border/50 bg-background/50",
              )}
            >
              {item.done ? (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
              </div>
              {!item.done && item.id === "syllabus" && (
                <FileText className="h-4 w-4 text-primary/70 shrink-0 mt-1" />
              )}
              {!item.done && item.id === "exams" && (
                <Calendar className="h-4 w-4 text-primary/70 shrink-0 mt-1" />
              )}
              {!item.done && item.id === "material" && (
                <Camera className="h-4 w-4 text-primary/70 shrink-0 mt-1" />
              )}
            </li>
          ))}
        </ul>

        <div className="rounded-2xl border border-primary/20 bg-background/70 p-3 sm:p-4 space-y-2">
          <p className="text-xs text-muted-foreground">{primary.hint}</p>
          <Button
            className="w-full sm:w-auto bg-gradient-calm border-0 text-primary-foreground"
            onClick={primary.onClick}
          >
            {primary.label}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
