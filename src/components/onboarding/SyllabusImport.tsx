import { useRef, useState } from "react";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseSyllabusFile } from "@/lib/onboarding/parseSyllabus";
import type { OnboardingData, OnboardingClass } from "@/lib/onboarding/types";

const ACCEPT = "application/pdf,image/*";
const MAX_BYTES = 15 * 1024 * 1024;

export function SyllabusImport({
  data,
  onMerge,
}: {
  data: OnboardingData;
  onMerge: (patch: Partial<OnboardingData>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("File too large", { description: "Please upload under 15 MB." });
      return;
    }
    setBusy(true);
    try {
      const hint = [data.term, data.school].filter(Boolean).join(", ");
      const parsed = await parseSyllabusFile(file, hint || undefined);

      const nextClasses: OnboardingClass[] = parsed.classes.length
        ? parsed.classes.map((c) => ({
            name: c.name ?? "",
            code: c.code ?? "",
            professor: c.professor ?? "",
            days: c.days ?? [],
            time: c.time ?? "",
            endTime: c.endTime ?? "",
            location: c.location ?? "",
            textbook: c.textbook ?? "",
            examDates: c.examDates ?? [],
            assignments: c.assignments ?? [],
          }))
        : data.classes;

      onMerge({
        name: data.name || parsed.student?.name || "",
        school: data.school || parsed.student?.school || "",
        term: data.term || parsed.student?.term || "",
        classes: nextClasses,
      });

      const extracted = parsed.classes.length;
      const exams = parsed.classes.reduce((n, c) => n + (c.examDates?.length ?? 0), 0);
      const asg = parsed.classes.reduce((n, c) => n + (c.assignments?.length ?? 0), 0);
      toast.success(`Imported ${extracted} class${extracted === 1 ? "" : "es"}`, {
        description: `${exams} exam${exams === 1 ? "" : "s"} · ${asg} assignment${
          asg === 1 ? "" : "s"
        } detected. Confirm below.`,
      });
    } catch (error: unknown) {
      toast.error("Couldn't read that file", {
        description: error instanceof Error ? error.message : "Try a clearer PDF or photo.",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Import from a syllabus or schedule</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a PDF or photo. Campus Brain fills in classes, professors, and dates — you just confirm.
          </p>
          <div className="mt-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handle(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Reading…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload file
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
