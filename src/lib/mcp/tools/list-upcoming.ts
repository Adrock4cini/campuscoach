import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assignments, exams } from "../../../data/demo";

/**
 * list_upcoming_deadlines — Assignments + exams due within the next N days.
 */
export default defineTool({
  name: "list_upcoming_deadlines",
  title: "List upcoming deadlines",
  description:
    "List upcoming assignments and exams within the given number of days (default 14). Includes class name, due date, priority, and readiness.",
  inputSchema: {
    days: z
      .number()
      .int()
      .min(1)
      .max(120)
      .optional()
      .describe("Look-ahead window in days. Defaults to 14."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ days }) => {
    const window = days ?? 14;
    const now = Date.now();
    const cutoff = now + window * 24 * 60 * 60 * 1000;

    const asg = assignments
      .filter((a) => {
        const t = Date.parse(a.dueDate);
        return !Number.isNaN(t) && t >= now && t <= cutoff;
      })
      .map((a) => ({
        kind: "assignment" as const,
        id: a.id,
        title: a.title,
        className: a.className,
        dueDate: a.dueDate,
        priority: a.priority,
        status: a.status,
      }));

    const exm = exams
      .filter((e) => {
        const t = Date.parse(e.date);
        return !Number.isNaN(t) && t >= now && t <= cutoff;
      })
      .map((e) => ({
        kind: "exam" as const,
        id: e.id,
        title: e.title,
        className: e.className,
        dueDate: e.date,
        readiness: e.readiness,
        weakAreas: e.weakAreas,
      }));

    const combined = [...asg, ...exm].sort(
      (a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate),
    );

    return {
      content: [
        {
          type: "text",
          text: combined.length
            ? JSON.stringify(combined, null, 2)
            : `No deadlines in the next ${window} days.`,
        },
      ],
      structuredContent: { windowDays: window, items: combined },
    };
  },
});
