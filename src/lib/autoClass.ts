import { classes, type ClassInfo } from "@/data/demo";

const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseHour(time: string): number {
  const m = time.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const isPM = m[3]?.toUpperCase() === "PM" && h !== 12;
  if (isPM) h += 12;
  if (m[3]?.toUpperCase() === "AM" && h === 12) h = 0;
  return h + (m[2] ? parseInt(m[2]) / 60 : 0);
}

/** Returns the class that's likely "now" based on day + time (±90 min window). */
export function detectCurrentClass(now: Date = new Date()): ClassInfo | null {
  const today = dayMap[now.getDay()];
  const hour = now.getHours() + now.getMinutes() / 60;

  let best: { c: ClassInfo; delta: number } | null = null;
  for (const c of classes) {
    if (!c.days.includes(today)) continue;
    const start = parseHour(c.time);
    const delta = Math.abs(hour - start);
    if (delta <= 1.5 && (!best || delta < best.delta)) best = { c, delta };
  }
  if (best) return best.c;

  // Fallback: most recent class earlier today, else next class
  const todays = classes.filter((c) => c.days.includes(today));
  if (todays.length) {
    const sorted = todays.sort((a, b) => parseHour(a.time) - parseHour(b.time));
    const past = sorted.filter((c) => parseHour(c.time) <= hour).pop();
    return past ?? sorted[0];
  }
  return null;
}
