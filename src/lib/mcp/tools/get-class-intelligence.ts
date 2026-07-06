import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { classes } from "@/data/demo";

/**
 * get_class_intelligence — Peer-aggregated topic scores for a class.
 * Reads from Supabase `topic_scores` (anonymous, aggregated data).
 */
export default defineTool({
  name: "get_class_intelligence",
  title: "Get class intelligence",
  description:
    "Return peer-aggregated 'high-yield' topics for a class: probability of appearing on the next exam, confidence band, and student engagement. Use `list_classes` to discover valid classId values.",
  inputSchema: {
    classId: z.string().min(1).describe("Class id, e.g. 'psych101'."),
    limit: z.number().int().min(1).max(50).optional().describe("Max topics to return. Default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ classId, limit }) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) {
      return {
        content: [{ type: "text", text: `Unknown classId: ${classId}` }],
        isError: true,
      };
    }

    // Read secrets inside the handler (import-safe entry).
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      return {
        content: [{ type: "text", text: "Backend is not configured." }],
        isError: true,
      };
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("topic_scores")
      .select("topic_name,probability,confidence_band,student_count,miss_rate,star_count")
      .eq("class_id", classId)
      .order("probability", { ascending: false })
      .limit(limit ?? 10);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const summary = {
      class: { id: cls.id, name: cls.name, professor: cls.professor },
      topics: data ?? [],
    };

    return {
      content: [
        {
          type: "text",
          text: (data ?? []).length
            ? JSON.stringify(summary, null, 2)
            : `No peer intelligence available yet for ${cls.name}.`,
        },
      ],
      structuredContent: summary,
    };
  },
});
