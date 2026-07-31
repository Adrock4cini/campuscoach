export interface CanvasCourse {
  id: string | number;
  name?: string;
  course_code?: string;
  html_url?: string;
  updated_at?: string;
  syllabus_body?: string;
  term?: unknown;
  teachers?: Array<{ display_name?: string; name?: string }>;
}

export interface CanvasAssignment {
  id: string | number;
  name?: string;
  description?: string;
  due_at?: string | null;
  updated_at?: string;
  html_url?: string;
  quiz_id?: string | number | null;
  submission_types?: string[];
  submission?: { workflow_state?: string; submitted_at?: string | null };
  points_possible?: number | null;
}

export function normalizeCanvasBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "https:") {
    throw new Error("Canvas must use a secure HTTPS address.");
  }
  if (url.username || url.password) {
    throw new Error("Canvas address cannot contain credentials.");
  }
  return url.origin;
}

export function canvasExternalId(baseUrl: string, id: string | number): string {
  return `${new URL(baseUrl).hostname.toLowerCase()}:${String(id)}`;
}

export function htmlToPlainText(
  value?: string | null,
  maxLength = 8000,
): string {
  if (!value) return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isCanvasExam(assignment: CanvasAssignment): boolean {
  if (
    assignment.quiz_id != null ||
    assignment.submission_types?.includes("online_quiz")
  ) return true;
  const title = assignment.name?.toLowerCase().trim() ?? "";
  if (
    /\b(final\s+(project|paper|presentation)|project|research\s+paper)\b/.test(
      title,
    )
  ) return false;
  return /\b(exam|test|quiz|midterm|final)\b/.test(title);
}

export function canvasCompletion(
  assignment: CanvasAssignment,
): "not_started" | "in_progress" | "complete" {
  const state = assignment.submission?.workflow_state?.toLowerCase();
  if (
    assignment.submission?.submitted_at ||
    ["submitted", "graded", "complete"].includes(state ?? "")
  ) {
    return "complete";
  }
  return state === "pending_review" ? "in_progress" : "not_started";
}

export function mapCanvasAssignment(
  assignment: CanvasAssignment,
  baseUrl: string,
) {
  const dueDate = assignment.due_at?.slice(0, 10) ?? null;
  return {
    kind: isCanvasExam(assignment) ? "exam" as const : "assignment" as const,
    title: assignment.name?.trim() || "Canvas coursework",
    notes: htmlToPlainText(assignment.description),
    dueDate,
    sourceDueAt: assignment.due_at ?? null,
    sourceUpdatedAt: assignment.updated_at ?? null,
    sourceUrl: assignment.html_url ?? null,
    externalId: canvasExternalId(baseUrl, assignment.id),
    status: canvasCompletion(assignment),
    meta: {
      canvas: {
        assignmentId: String(assignment.id),
        quizId: assignment.quiz_id == null ? null : String(assignment.quiz_id),
        pointsPossible: assignment.points_possible ?? null,
      },
    },
  };
}
