import { useEffect, useState } from "react";
import { AlertCircle, CalendarCheck2, ClipboardList, Clock3, GraduationCap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { DayPicker } from "@/components/onboarding/DayPicker";
import type {
  SyllabusReviewDraft,
  SyllabusReviewScheduleItem,
} from "@/lib/syllabus";
import {
  validateSyllabusReview,
  type SyllabusReviewValidation,
} from "./reviewValidation";

interface SyllabusDeadlineRow {
  key: string;
  included: boolean;
  title: string;
  date: string;
  topics?: string[];
}

interface SyllabusReviewFormProps {
  value: SyllabusReviewDraft;
  onChange: (value: SyllabusReviewDraft) => void;
  disabled?: boolean;
  validation?: SyllabusReviewValidation;
}

export function SyllabusReviewForm({
  value,
  onChange,
  disabled = false,
  validation = validateSyllabusReview(value),
}: SyllabusReviewFormProps) {
  const update = <K extends keyof SyllabusReviewDraft>(key: K, next: SyllabusReviewDraft[K]) => {
    onChange({ ...value, [key]: next });
  };
  const updateClass = <K extends keyof SyllabusReviewDraft["class"]>(
    key: K,
    next: SyllabusReviewDraft["class"][K],
  ) => {
    onChange({ ...value, class: { ...value.class, [key]: next } });
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="term-details-heading" className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CalendarCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 id="term-details-heading" className="font-display text-lg font-semibold">Term details</h2>
            <p className="text-sm text-muted-foreground">Correct anything the syllabus reader misunderstood.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="syllabus-term">Term <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="syllabus-term"
              value={value.class.term}
              onChange={(event) => updateClass("term", event.target.value)}
              disabled={disabled}
              className="min-h-11 text-base sm:text-sm"
              placeholder="Fall 2026"
            />
          </div>
          <fieldset disabled={disabled} className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Class meets on</legend>
            <DayPicker
              value={value.class.weekdays}
              onChange={(days) => updateClass("weekdays", days as SyllabusReviewDraft["class"]["weekdays"])}
            />
            <p className="text-xs text-muted-foreground">Keep your saved days if the syllabus does not list them.</p>
            {validation.errors.weekdays && <p role="alert" className="text-sm font-medium text-destructive">{validation.errors.weekdays}</p>}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="syllabus-start-time">Starts {value.class.weekdays.length === 0 && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</Label>
            <div className="relative">
              <Clock3 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="syllabus-start-time"
                type="time"
                value={value.class.startTime}
                onChange={(event) => updateClass("startTime", event.target.value)}
                disabled={disabled}
                required={value.class.weekdays.length > 0}
                aria-invalid={Boolean(validation.errors["start-time"])}
                aria-describedby={validation.errors["start-time"] ? "syllabus-start-time-error" : undefined}
                className="min-h-11 pl-10 text-base [color-scheme:dark] sm:text-sm"
              />
            </div>
            {validation.errors["start-time"] && <p id="syllabus-start-time-error" role="alert" className="text-sm font-medium text-destructive">{validation.errors["start-time"]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="syllabus-end-time">Ends <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="syllabus-end-time"
              type="time"
              value={value.class.endTime}
              onChange={(event) => updateClass("endTime", event.target.value)}
              disabled={disabled}
              aria-invalid={Boolean(validation.errors["end-time"])}
              aria-describedby={validation.errors["end-time"] ? "syllabus-end-time-error" : undefined}
              className="min-h-11 text-base [color-scheme:dark] sm:text-sm"
            />
            {validation.errors["end-time"] && <p id="syllabus-end-time-error" role="alert" className="text-sm font-medium text-destructive">{validation.errors["end-time"]}</p>}
          </div>
          <DatePickerField
            id="syllabus-term-start"
            label="Term starts"
            value={value.class.semesterStartDate}
            onChange={(next) => updateClass("semesterStartDate", next)}
            disabled={disabled}
            required={value.class.weekdays.length > 0}
            error={validation.errors["term-start"]}
          />
          <DatePickerField
            id="syllabus-term-end"
            label="Term ends"
            value={value.class.semesterEndDate}
            onChange={(next) => updateClass("semesterEndDate", next)}
            disabled={disabled}
            required={value.class.weekdays.length > 0}
            min={value.class.semesterStartDate || undefined}
            error={validation.errors["term-end"]}
          />
        </div>
      </section>

      <ReviewRowsSection
        heading="Assignments & quizzes"
        description="Review homework, quizzes, papers, labs, readings, and other dated work found in the syllabus."
        icon={<ClipboardList aria-hidden="true" className="h-5 w-5" />}
        kind="assignment"
        rows={value.assignments.map((row) => ({ ...row, date: row.dueDate }))}
        disabled={disabled}
        emptyText="No assignments or quizzes were found. You can add them later from the class page."
        errors={validation.errors}
        onChange={(rows) => update("assignments", rows.map((row, index) => ({
          ...value.assignments[index],
          key: row.key,
          included: row.included,
          title: row.title,
          dueDate: row.date,
        })))}
      />

      <ReviewRowsSection
        heading="Exams"
        description="Check each test name and date before it reaches your calendar."
        icon={<GraduationCap aria-hidden="true" className="h-5 w-5" />}
        kind="exam"
        rows={value.exams.map((row) => ({ ...row, date: row.examDate, topics: row.topics }))}
        disabled={disabled}
        emptyText="No exams were found. You can add test dates later from the class page."
        errors={validation.errors}
        onChange={(rows) => update("exams", rows.map((row, index) => ({
          ...value.exams[index],
          key: row.key,
          included: row.included,
          title: row.title,
          examDate: row.date,
          topics: row.topics ?? [],
        })))}
      />

      <ScheduleRowsSection
        rows={value.schedule}
        disabled={disabled}
        errors={validation.errors}
        onChange={(rows) => update("schedule", rows)}
      />

      {!validation.valid && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Fix or exclude {validation.issueCount} {validation.issueCount === 1 ? "item" : "items"} before saving.</p>
        </div>
      )}
    </div>
  );
}

function ReviewRowsSection({
  heading,
  description,
  icon,
  kind,
  rows,
  disabled,
  emptyText,
  errors,
  onChange,
}: {
  heading: string;
  description: string;
  icon: React.ReactNode;
  kind: "assignment" | "exam";
  rows: SyllabusDeadlineRow[];
  disabled: boolean;
  emptyText: string;
  errors: Record<string, string>;
  onChange: (rows: SyllabusDeadlineRow[]) => void;
}) {
  const replace = (index: number, patch: Partial<SyllabusDeadlineRow>) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  return (
    <section aria-labelledby={`${kind}-review-heading`} className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`${kind}-review-heading`} className="font-display text-lg font-semibold">{heading}</h2>
            <span className="text-xs text-muted-foreground">{rows.filter((row) => row.included).length} included</span>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const titleId = `${kind}-${index}-title`;
            const titleError = errors[`${kind}-${row.key}-title`];
            const dateError = errors[`${kind}-${row.key}-date`];
            const topicsError = errors[`${kind}-${row.key}-topics`];
            return (
              <div key={row.key} className="rounded-xl border border-border/70 bg-card p-3 sm:p-4">
                <div className="mb-3 flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm font-medium">
                  <Checkbox
                    id={`${kind}-${index}-included`}
                    checked={row.included}
                    onCheckedChange={(checked) => replace(index, { included: checked === true })}
                    disabled={disabled}
                    className="h-5 w-5"
                    aria-label={`Include ${kind} ${index + 1}`}
                  />
                  <Label htmlFor={`${kind}-${index}-included`} className="flex min-h-11 cursor-pointer items-center">
                    {row.included ? `Include this ${kind}` : `Excluded ${kind}`}
                  </Label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={titleId}>{kind === "assignment" ? "Assignment name" : "Exam name"}</Label>
                    <Input
                      id={titleId}
                      value={row.title}
                      onChange={(event) => replace(index, { title: event.target.value })}
                      disabled={disabled || !row.included}
                      aria-invalid={Boolean(titleError)}
                      aria-describedby={titleError ? `${titleId}-error` : undefined}
                      className="min-h-11 text-base sm:text-sm"
                    />
                    {titleError && <p id={`${titleId}-error`} role="alert" className="text-sm font-medium text-destructive">{titleError}</p>}
                  </div>
                  <DatePickerField
                    id={`${kind}-${index}-date`}
                    label={kind === "assignment" ? "Due date" : "Exam date"}
                    value={row.date}
                    onChange={(date) => replace(index, { date })}
                    required={row.included}
                    disabled={disabled || !row.included}
                    error={dateError}
                  />
                  {kind === "exam" && (
                    <ExamTopicsField
                      id={`${kind}-${index}-topics`}
                      topics={row.topics ?? []}
                      disabled={disabled || !row.included}
                      error={topicsError}
                      onChange={(topics) => replace(index, { topics })}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExamTopicsField({
  id,
  topics,
  disabled,
  error,
  onChange,
}: {
  id: string;
  topics: string[];
  disabled: boolean;
  error?: string;
  onChange: (topics: string[]) => void;
}) {
  const externalValue = topics.join("\n");
  const [draft, setDraft] = useState(externalValue);

  useEffect(() => {
    setDraft((current) => normalizeTopicText(current) === externalValue ? current : externalValue);
  }, [externalValue]);

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={id}>Topics to study <span className="text-xs font-normal text-muted-foreground">(one per line)</span></Label>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onChange(topicLines(next));
        }}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-help`}
        className="min-h-24 text-base sm:text-sm"
        placeholder={"Chapter 4 concepts\nKey vocabulary\nPractice problems"}
      />
      {error
        ? <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">{error}</p>
        : <p id={`${id}-help`} className="text-xs text-muted-foreground">These help Study Lab focus your notes and captures for this exam.</p>}
    </div>
  );
}

function topicLines(value: string) {
  return value.split("\n").map((topic) => topic.trim()).filter(Boolean);
}

function normalizeTopicText(value: string) {
  return topicLines(value).join("\n");
}

function ScheduleRowsSection({
  rows,
  disabled,
  errors,
  onChange,
}: {
  rows: SyllabusReviewScheduleItem[];
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (rows: SyllabusReviewScheduleItem[]) => void;
}) {
  const replace = (index: number, patch: Partial<SyllabusReviewScheduleItem>) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  return (
    <section aria-labelledby="topic-review-heading" className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CalendarCheck2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="topic-review-heading" className="font-display text-lg font-semibold">Class topics</h2>
            <span className="text-xs text-muted-foreground">{rows.filter((row) => row.included).length} included</span>
          </div>
          <p className="text-sm text-muted-foreground">These dates help Campus Brain connect lectures and study material.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No dated class topics were found. That will not block this import.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const topicId = `topic-${index}-title`;
            const topicError = errors[`topic-${row.key}-title`];
            const dateError = errors[`topic-${row.key}-date`];
            return (
              <div key={row.key} className="rounded-xl border border-border/70 bg-card p-3 sm:p-4">
                <div className="mb-3 flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm font-medium">
                  <Checkbox
                    id={`topic-${index}-included`}
                    checked={row.included}
                    onCheckedChange={(checked) => replace(index, { included: checked === true })}
                    disabled={disabled}
                    className="h-5 w-5"
                    aria-label={`Include class topic ${index + 1}`}
                  />
                  <Label htmlFor={`topic-${index}-included`} className="flex min-h-11 cursor-pointer items-center">
                    {row.included ? "Include this class topic" : "Excluded class topic"}
                  </Label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={topicId}>Topic</Label>
                    <Input
                      id={topicId}
                      value={row.topic}
                      onChange={(event) => replace(index, { topic: event.target.value })}
                      disabled={disabled || !row.included}
                      aria-invalid={Boolean(topicError)}
                      aria-describedby={topicError ? `${topicId}-error` : undefined}
                      className="min-h-11 text-base sm:text-sm"
                    />
                    {topicError && <p id={`${topicId}-error`} role="alert" className="text-sm font-medium text-destructive">{topicError}</p>}
                  </div>
                  <DatePickerField
                    id={`topic-${index}-date`}
                    label="Class date"
                    value={row.date}
                    onChange={(date) => replace(index, { date })}
                    required={row.included}
                    disabled={disabled || !row.included}
                    error={dateError}
                  />
                </div>
                {row.dueItems.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">Also mentioned: {row.dueItems.join(", ")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
