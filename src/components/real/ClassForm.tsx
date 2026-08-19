import { useState } from "react";
import { useForm } from "react-hook-form";
import { CalendarRange, Clock3, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { DayPicker } from "@/components/onboarding/DayPicker";
import { academicTermOptions } from "@/lib/onboarding/options";
import {
  classEditorSchema,
  type ClassEditorValues,
} from "@/lib/realData/classes";

interface ClassFormProps {
  mode: "create" | "edit";
  initialValues: ClassEditorValues;
  onSubmit: (values: ClassEditorValues) => Promise<void>;
  onCancel: () => void;
}

export function ClassForm({ mode, initialValues, onSubmit, onCancel }: ClassFormProps) {
  const [saveError, setSaveError] = useState("");
  const form = useForm<ClassEditorValues>({
    defaultValues: initialValues,
  });
  const selectedDays = form.watch("weekdays");
  const saving = form.formState.isSubmitting;
  const termOptions = [
    ...new Set([
      initialValues.term,
      ...academicTermOptions(),
    ].filter(Boolean)),
  ];

  const submit = form.handleSubmit(async (values) => {
    setSaveError("");
    form.clearErrors();

    const result = classEditorSchema.safeParse(values);
    if (!result.success) {
      let firstField: keyof ClassEditorValues | undefined;
      result.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (typeof field !== "string" || !(field in values)) return;
        const fieldName = field as keyof ClassEditorValues;
        firstField ??= fieldName;
        form.setError(fieldName, { type: "manual", message: issue.message });
      });
      if (firstField && firstField !== "weekdays") form.setFocus(firstField);
      return;
    }

    try {
      await onSubmit(result.data);
    } catch (error) {
      console.warn("[class-form] save failed", error);
      setSaveError("Couldn’t save this class. Your entries are still here—please try again.");
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-7" noValidate>
        <section className="space-y-4" aria-labelledby="class-basics-heading">
          <div>
            <h2 id="class-basics-heading" className="font-display text-lg font-semibold text-foreground">
              Class details
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Add what you know now. You can change it later.</p>
          </div>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Class name</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus placeholder="Biology II" className="min-h-11 text-base sm:text-sm" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course code <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="BIO 202" className="min-h-11 text-base sm:text-sm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="section"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="001" className="min-h-11 text-base sm:text-sm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="professor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teacher or instructor <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="Ms. Chen" className="min-h-11 text-base sm:text-sm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <div className="relative">
                    <MapPin aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input {...field} placeholder="Science 204 or Online" className="min-h-11 pl-10 text-base sm:text-sm" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="term"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Term</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="min-h-11"><SelectValue placeholder="Choose a term" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {termOptions.map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="space-y-4 border-t border-border/50 pt-6" aria-labelledby="class-schedule-heading">
          <div>
            <h2 id="class-schedule-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
              <CalendarRange className="h-5 w-5 text-primary" /> Schedule
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional for online classes. Term dates prevent meetings from repeating after the term.
            </p>
          </div>

          <FormField
            control={form.control}
            name="weekdays"
            render={({ field }) => (
              <FormItem>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium leading-none">Class meets on</legend>
                  <DayPicker value={field.value} onChange={field.onChange} />
                </fieldset>
                <FormDescription>Choose every weekday for this meeting time.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <div className="relative">
                    <Clock3 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input {...field} type="time" className="min-h-11 pl-10 text-base [color-scheme:dark] sm:text-sm" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ends <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl><Input {...field} type="time" className="min-h-11 text-base [color-scheme:dark] sm:text-sm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="semesterStartDate"
              render={({ field, fieldState }) => (
                <DatePickerField
                  id="semester-start-date"
                  label="Term starts"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  required={selectedDays.length > 0}
                  error={fieldState.error?.message}
                />
              )}
            />
            <FormField
              control={form.control}
              name="semesterEndDate"
              render={({ field, fieldState }) => (
                <DatePickerField
                  id="semester-end-date"
                  label="Term ends"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  required={selectedDays.length > 0}
                  min={form.watch("semesterStartDate") || undefined}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground">Times are saved in {initialValues.timeZone.replace(/_/g, " ")}.</p>
        </section>

        {saveError && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className="min-h-11 bg-gradient-calm text-primary-foreground" disabled={saving}>
            {saving
              ? mode === "create" ? "Adding class…" : "Saving changes…"
              : mode === "create" ? "Add class" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
