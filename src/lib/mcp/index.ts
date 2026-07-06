import { defineMcp } from "@lovable.dev/mcp-js";
import listClasses from "./tools/list-classes";
import listUpcoming from "./tools/list-upcoming";
import getClassIntelligence from "./tools/get-class-intelligence";

/**
 * Campus Companion MCP server.
 * Exposes read-only academic context (classes, deadlines, peer intelligence)
 * to any MCP-capable assistant so students can chat with their coursework
 * from ChatGPT / Claude / Cursor.
 */
export default defineMcp({
  name: "campus-companion-mcp",
  title: "Campus Companion",
  version: "0.1.0",
  instructions:
    "Tools for Campus Companion, an AI academic OS for college students (ADHD-friendly). " +
    "Use `list_classes` to discover the student's current classes and readiness. " +
    "Use `list_upcoming_deadlines` for assignments and exams coming due. " +
    "Use `get_class_intelligence` for peer-aggregated high-yield topics on a specific class. " +
    "All tools are read-only.",
  tools: [listClasses, listUpcoming, getClassIntelligence],
});
