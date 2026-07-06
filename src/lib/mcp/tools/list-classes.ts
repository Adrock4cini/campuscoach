import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { classes } from "@/data/demo";

/**
 * list_classes — Return an overview of the student's classes with readiness.
 */
export default defineTool({
  name: "list_classes",
  title: "List classes",
  description:
    "List the student's current classes with professor, meeting time, current topic, next exam date, and readiness score.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const rows = classes.map((c) => ({
      id: c.id,
      name: c.name,
      professor: c.professor,
      location: c.location,
      meets: `${c.days.join("/")} ${c.time}`,
      currentTopic: c.currentTopic,
      nextExamDate: c.nextExamDate,
      readiness: c.readiness,
      suggestedAction: c.suggestedAction,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { classes: rows },
    };
  },
});
