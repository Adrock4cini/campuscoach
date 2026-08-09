import { forwardRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  description?: string;
  error?: string;
  className?: string;
}

/**
 * Native date controls open the operating-system picker on iPhone/Android,
 * remain keyboard accessible, and keep the exact YYYY-MM-DD value intact.
 */
export const DatePickerField = forwardRef<HTMLInputElement, DatePickerFieldProps>(
  function DatePickerField(
    {
      id,
      label,
      value,
      onChange,
      onBlur,
      name,
      required = false,
      disabled = false,
      min,
      max,
      description,
      error,
      className,
    },
    ref,
  ) {
    const descriptionId = description ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className={cn("space-y-1.5", className)}>
        <Label htmlFor={id} className={cn(error && "text-destructive")}>
          {label}
          {!required && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}
        </Label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <CalendarDays
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={ref}
              id={id}
              name={name}
              type="date"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              required={required}
              disabled={disabled}
              min={min}
              max={max}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
              className="min-h-11 pl-10 text-base [color-scheme:dark] sm:text-sm"
            />
          </div>
          {!required && value && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange("")}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);
