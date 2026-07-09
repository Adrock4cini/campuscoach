import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClasses from "./tools/list-classes";
import listUpcoming from "./tools/list-upcoming";
import getClassIntelligence from "./tools/get-class-intelligence";

/**
 * Campus Companion MCP server.
 *
 * Exposes read-only academic context (classes, deadlines, peer intelligence)
 * to any MCP-capable assistant so students can chat with their coursework
 * from ChatGPT / Claude / Cursor.
 *
 * Auth: Supabase OAuth 2.1. The issuer must be the direct supabase.co host
 * (not the Lovable Cloud proxy) — mcp-js validates the token issuer against
 * the discovery document. VITE_SUPABASE_PROJECT_ID is inlined at build time
 * so this stays import-safe (no runtime env read at module top level).
 */
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

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
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClasses, listUpcoming, getClassIntelligence],
});

