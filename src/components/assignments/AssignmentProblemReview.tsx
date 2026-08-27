import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS,
  type AssignmentPracticeSource,
} from "@/lib/assignments/assignmentPracticeSource";
import {
  AssignmentPracticeSourceConfirmationError,
  confirmAssignmentPracticeSource,
} from "@/lib/supabase/assignmentPracticeSource";
import {
  isAssignmentTutorTextSupported,
  isConfirmedAssignmentTutorPracticeSource,
} from "@/lib/assignments/assignmentTutorSupport";

interface Props {
  captureId: string;
  assignmentId: string;
  classId: string;
  source: AssignmentPracticeSource;
  onConfirmed: (source: AssignmentPracticeSource) => void;
  onFallback?: () => void;
  className?: string;
}

export function AssignmentProblemReview({
  captureId,
  assignmentId,
  classId,
  source,
  onConfirmed,
  onFallback,
  className,
}: Props) {
  const confirmedTutorSupported = isConfirmedAssignmentTutorPracticeSource(source);
  const [editing, setEditing] = useState(!confirmedTutorSupported);
  const [text, setText] = useState(source.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const tutorSupported = isAssignmentTutorTextSupported(text);
  const showConceptFallback = Boolean(onFallback && (!tutorSupported || unsupported));

  useEffect(() => {
    setText(source.text ?? "");
    setEditing(!isConfirmedAssignmentTutorPracticeSource(source));
    setError(null);
    setUnsupported(false);
  }, [source]);

  if (source.status === "not_required") return null;
  if (source.status === "processing") {
    return (
      <p
        role="status"
        className={cn("w-full rounded-2xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground", className)}
      >
        Campus Companion is still preparing the problem text for you to check.
      </p>
    );
  }

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setUnsupported(false);
    try {
      const next = await confirmAssignmentPracticeSource({
        captureId,
        assignmentId,
        classId,
        text,
        expectedVersion: source.version,
      });
      setEditing(false);
      onConfirmed(next);
      window.dispatchEvent(new CustomEvent("coach:refresh"));
    } catch (nextError: unknown) {
      setUnsupported(
        nextError instanceof AssignmentPracticeSourceConfirmationError
        && nextError.reason === "unsupported_assignment_problem",
      );
      setError(nextError instanceof Error ? nextError.message : "Couldn’t confirm this problem. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby={`assignment-problem-review-${captureId}`}
      className={cn("w-full space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`assignment-problem-review-${captureId}`} className="text-sm font-semibold text-foreground">
            {confirmedTutorSupported && !editing ? "Percent problem confirmed" : "Check the problem"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {confirmedTutorSupported && !editing
              ? "Your guided walkthrough will use exactly this problem."
              : "Early Access walkthroughs support one percent-of or percent-discount problem. Check every number and symbol before confirming."}
          </p>
        </div>
        {confirmedTutorSupported && !editing && (
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        )}
      </div>

      {editing ? (
        <>
          <div>
            <label htmlFor={`assignment-problem-text-${captureId}`} className="sr-only">
              Problem Campus Companion read
            </label>
            <textarea
              id={`assignment-problem-text-${captureId}`}
              aria-label="Problem Campus Companion read"
              value={text}
              maxLength={MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS}
              rows={3}
              disabled={saving}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
                setUnsupported(false);
              }}
              className="w-full resize-y rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-base text-foreground shadow-sm sm:text-sm"
              placeholder="Type the complete problem exactly as it appears"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {text.length}/{MAX_ASSIGNMENT_PRACTICE_SOURCE_CHARS}
            </p>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {!tutorSupported && text.trim() && !error && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              This capture is still saved. You can edit it to one supported percent problem or study its saved class concepts instead.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11 flex-1 rounded-xl"
              disabled={saving || !tutorSupported}
              onClick={() => { void save(); }}
            >
              {saving && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Confirming…" : "Confirm for walkthrough"}
            </Button>
            {confirmedTutorSupported && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-xl"
                disabled={saving}
                onClick={() => {
                  setText(source.text ?? "");
                  setEditing(false);
                  setError(null);
                  setUnsupported(false);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          {showConceptFallback && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full rounded-xl"
              onClick={onFallback}
            >
              Study saved concepts instead
            </Button>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 text-sm text-foreground">
            {source.text}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-2 text-primary"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden className="mr-2 h-4 w-4" /> Edit problem
          </Button>
        </div>
      )}
    </section>
  );
}
