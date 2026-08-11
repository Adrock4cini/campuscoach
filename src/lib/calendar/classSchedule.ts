import { isDateKey } from "./dateKey";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_SET = new Set<string>(WEEKDAYS);

const WEEKDAY_ALIASES: Record<string, Weekday[]> = {
  m: ["Mon"], mon: ["Mon"], monday: ["Mon"],
  t: ["Tue"], tu: ["Tue"], tue: ["Tue"], tues: ["Tue"], tuesday: ["Tue"],
  w: ["Wed"], wed: ["Wed"], wednesday: ["Wed"],
  th: ["Thu"], thu: ["Thu"], thur: ["Thu"], thurs: ["Thu"], thursday: ["Thu"],
  f: ["Fri"], fri: ["Fri"], friday: ["Fri"],
  sa: ["Sat"], sat: ["Sat"], saturday: ["Sat"],
  su: ["Sun"], sun: ["Sun"], sunday: ["Sun"],
  mwf: ["Mon", "Wed", "Fri"],
  tth: ["Tue", "Thu"],
};

export function normalizeWeekdays(values: readonly string[] | null | undefined): Weekday[] {
  const selected = new Set<Weekday>();
  for (const value of values ?? []) {
    if (WEEKDAY_SET.has(value)) {
      selected.add(value as Weekday);
      continue;
    }
    const tokens = value.trim().toLowerCase().replace(/[.]/g, "").split(/[\s,/&]+/).filter(Boolean);
    tokens.flatMap((token) => WEEKDAY_ALIASES[token] ?? []).forEach((day) => selected.add(day));
  }
  return WEEKDAYS.filter((day) => selected.has(day));
}

export function weekdayForDate(date: Date): Weekday {
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[date.getDay()];
}

/** Accept legacy 12-hour values and return one canonical HH:mm time key. */
export function normalizeTimeKey(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const twentyFourHour = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    return hours <= 23 && minutes <= 59
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
      : "";
  }

  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (!twelveHour) return "";
  let hours = Number(twelveHour[1]);
  const minutes = Number(twelveHour[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return "";
  const meridiem = twelveHour[3].toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatTimeKey(value: string | null | undefined): string {
  const normalized = normalizeTimeKey(value);
  if (!normalized) return "";
  const [hours, minutes] = normalized.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

export function isDateWithinTerm(
  dateKey: string,
  startsOn?: string | null,
  endsOn?: string | null,
) {
  if (!isDateKey(dateKey)) return false;
  if (startsOn && isDateKey(startsOn) && dateKey < startsOn) return false;
  if (endsOn && isDateKey(endsOn) && dateKey > endsOn) return false;
  return true;
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
