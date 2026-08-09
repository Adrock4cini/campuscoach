export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a database date without letting JavaScript reinterpret it as UTC.
 * `new Date("2026-08-09")` is UTC midnight and can display as August 8 in
 * Mountain Time. Constructing from calendar parts keeps the student's day.
 */
export function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isDateKey(value: string | null | undefined): value is string {
  return parseDateKey(value) !== null;
}

export function todayDateKey(now = new Date()) {
  return toDateKey(now);
}

export function formatDateKey(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
) {
  const date = parseDateKey(value);
  return date ? date.toLocaleDateString(undefined, options) : "";
}
