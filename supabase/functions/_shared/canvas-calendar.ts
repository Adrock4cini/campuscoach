export interface CalendarItem {
  uid: string;
  title: string;
  description: string;
  dueAt: string;
  sourceUrl: string | null;
  courseId: string;
  courseName: string;
  kind: "assignment" | "exam";
}

export function validateCanvasFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Paste the complete Canvas calendar link.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !(host === "instructure.com" || host.endsWith(".instructure.com")) ||
    !url.pathname.startsWith("/feeds/calendars/") ||
    !url.pathname.endsWith(".ics")
  ) {
    throw new Error("Use the private calendar link copied from Canvas.");
  }
  url.hash = "";
  return url;
}

export function parseCanvasCalendar(value: string): CalendarItem[] {
  const unfolded = value.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const items: CalendarItem[] = [];
  for (const block of blocks.slice(0, 2500)) {
    const fields = readFields(block);
    const uid = first(fields, "UID");
    const summary = clean(first(fields, "SUMMARY"));
    const rawDate = first(fields, "DTSTART") || first(fields, "DTEND");
    if (!uid || !summary || !rawDate) continue;
    const dueAt = parseIcsDate(rawDate);
    if (!dueAt) continue;
    const sourceUrl = safeCanvasItemUrl(first(fields, "URL"));
    const courseId = sourceUrl?.match(/\/courses\/(\d+)/)?.[1] ||
      stableCourseId(summary);
    const courseName = inferCourseName(summary);
    const title = stripCourseSuffix(summary, courseName);
    const description = clean(first(fields, "DESCRIPTION"));
    items.push({
      uid,
      title,
      description,
      dueAt,
      sourceUrl,
      courseId,
      courseName,
      kind: looksLikeExam(title, description) ? "exam" : "assignment",
    });
  }
  return items;
}

function readFields(block: string) {
  const fields = new Map<string, string[]>();
  for (const line of block.split(/\r?\n/)) {
    const split = line.indexOf(":");
    if (split < 1) continue;
    const key = line.slice(0, split).split(";")[0].toUpperCase();
    const existing = fields.get(key) ?? [];
    existing.push(line.slice(split + 1));
    fields.set(key, existing);
  }
  return fields;
}
function first(fields: Map<string, string[]>, key: string) {
  return fields.get(key)?.[0] ?? "";
}
function clean(value: string) {
  return value.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1").trim();
}
function parseIcsDate(value: string): string | null {
  const normalized = value.trim();
  const match = normalized.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/,
  );
  if (!match) return null;
  const [, year, month, day, hour = "12", minute = "00", second = "00"] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${
    normalized.endsWith("Z") ? "Z" : ""
  }`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function safeCanvasItemUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(clean(value));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function inferCourseName(summary: string) {
  const bracket = summary.match(/\[([^\]]{2,100})\]\s*$/);
  return bracket?.[1]?.trim() || "Canvas";
}
function stripCourseSuffix(summary: string, courseName: string) {
  if (courseName === "Canvas") return summary.replace(/^Assignment:\s*/i, "");
  return summary
    .replace(new RegExp(`\\s*\\[${escapeRegExp(courseName)}\\]\\s*$`), "")
    .replace(/^Assignment:\s*/i, "")
    .trim();
}
function stableCourseId(summary: string) {
  const name = inferCourseName(summary).toLowerCase();
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `calendar-${(hash >>> 0).toString(36)}`;
}
function looksLikeExam(title: string, description: string) {
  return /\b(exam|midterm|final|test|quiz)\b/i.test(`${title} ${description}`);
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

