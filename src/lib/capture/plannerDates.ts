/** Conservative proposals from saved source text, never from an AI summary.
 * A proposal is not a planner item: the student must check and confirm it.
 */
export const CAPTURE_PLANNER_VERSION = "capture-planner-v1";

export interface PlannerSource {
  id: string;
  client_class_id: string | null;
  class_id: string | null;
  kind: string;
  topic: string | null;
  captured_on: string;
  processing_status: string;
  raw_text: string | null;
}

export interface PlannerDateProposal {
  key: string;
  captureId: string;
  classId: string;
  kind: "assignment" | "exam";
  title: string;
  date: string;
  excerpt: string;
  sourceLabel: string;
  warnings: string[];
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const monthPattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const datePattern = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|${monthPattern}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)\\b`, "gi");
const workPattern = /\b(assignment|homework|problem set|worksheet|paper|essay|project|report|lab report|discussion|submit|due|quiz|exam|midterm|final exam|test)\b/i;
const examPattern = /\b(quiz|exam|midterm|final exam|test)\b/i;
const relativePattern = /\b(?:(?:next|this)\s+)?(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|tomorrow|tonight)\b/i;
const supportedKinds = new Set(["scan-material", "scan-board", "scan-textbook", "quick-note", "professor-hint", "record-lecture"]);

export function validPlannerDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseDate(text: string, reference: string): { date: string; warnings: string[] } {
  const warnings: string[] = [];
  let date = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) date = text;
  else if (text.includes("/")) {
    // 9/12 can mean September 12 or December 9. Never silently choose a locale.
    return { date: "", warnings: ["Numeric date: choose the intended month, day and year."] };
  } else {
    const match = text.match(/^(\w+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i);
    if (match) {
      const year = match[3] ?? (validPlannerDate(reference) ? reference.slice(0, 4) : "");
      if (!match[3]) warnings.push(`Year missing from source${year ? `; ${year} is suggested from the capture date` : ""}. Check the year.`);
      const month = months.indexOf(match[1].toLowerCase().slice(0, 3)) + 1;
      if (year && month) date = `${year}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    }
  }
  if (!validPlannerDate(date)) return { date: "", warnings: [...warnings, "This date needs correction before adding it."] };
  return { date, warnings };
}

export function plannerDateWarnings(excerpt: string, date: string): string[] {
  if (!validPlannerDate(date)) return [];
  const warnings: string[] = [];
  const weekday = excerpt.match(relativePattern)?.[0].replace(/^(next|this)\s+/i, "").slice(0, 3).toLowerCase();
  const actual = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday && weekdays.includes(weekday) && weekdays[actual] !== weekday) {
    warnings.push("The written weekday does not match this date. Check with your professor.");
  }
  if (/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b|\b(?:noon|midnight)\b/i.test(excerpt)) {
    warnings.push("The source includes a time. This adds the date only; the original time is kept in notes.");
  }
  return warnings;
}

function titleFrom(excerpt: string, dateText: string, kind: PlannerDateProposal["kind"]): string {
  return excerpt.replace(dateText, "")
    .replace(/\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/gi, "")
    .replace(/\b(?:is|on|due|by|at)\s*[:,-]?\s*$/i, "")
    .replace(/\s+/g, " ").replace(/^[\s•*#:-]+|[\s,;:.-]+$/g, "").slice(0, 180)
    || (kind === "exam" ? "Test from class material" : "Assignment from class material");
}

export function extractPlannerDates(source: PlannerSource): PlannerDateProposal[] {
  if (source.processing_status !== "ready" || !source.client_class_id || !source.raw_text || !supportedKinds.has(source.kind)) return [];
  const proposals: PlannerDateProposal[] = [];
  const seen = new Set<string>();
  // Bound untrusted OCR and keep each date paired with its own sentence/line.
  const lines = source.raw_text.slice(0, 50_000).split(/\n|;|(?<=[.!?])\s+(?=[A-Z])/);
  let heading = "";
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim().slice(0, 600);
    if (!line) { heading = ""; continue; }
    const dates = [...line.matchAll(datePattern)];
    const relative = dates.length ? null : line.match(relativePattern);
    if (!dates.length && !relative) {
      heading = workPattern.test(line) && line.length <= 120 ? line : "";
      continue;
    }
    const excerpt = !workPattern.test(line) && heading ? `${heading} — ${line}` : line;
    heading = "";
    if (!workPattern.test(excerpt)) continue;
    // Cancelled announcements and examples are not current work.
    if (/\b(cancelled|canceled|no (?:quiz|exam|test)|practice example|for example)\b/i.test(excerpt)) continue;
    // Multiple dates in one sentence can describe a range or a reschedule.
    // Offer one unresolved review row instead of inventing separate deadlines.
    const dateText = dates[0]?.[0] ?? relative?.[0] ?? "";
    const parsed = dates.length === 1 ? parseDate(dateText, source.captured_on)
      : { date: "", warnings: [dates.length > 1 ? "Several dates appear together. Choose the actual deadline." : "Relative date: choose the exact calendar date."] };
    const kind = examPattern.test(excerpt) && !/\b(?:study for|prepare for|review for|practice test|practice quiz)\b/i.test(excerpt) ? "exam" : "assignment";
    const key = `${kind}:${excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({ key, captureId: source.id, classId: source.client_class_id, kind,
      title: titleFrom(excerpt, dates.length === 1 ? dateText : "", kind), date: parsed.date,
      excerpt, sourceLabel: source.topic || "Class material", warnings: parsed.warnings });
    if (proposals.length === 40) break;
  }
  return proposals;
}

export function plannerTitleKey(title: string): string {
  return title.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
