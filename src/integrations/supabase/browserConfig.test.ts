import { describe, expect, it } from "vitest";
import {
  projectRefFromSupabaseUrl,
  validateBrowserSupabaseConfig,
} from "./browserConfig";

function legacyKey(role: "anon" | "service_role") {
  const payload = btoa(JSON.stringify({ role })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

describe("Supabase browser release configuration", () => {
  it("accepts a publishable key only when the hosted URL and project ID agree", () => {
    expect(validateBrowserSupabaseConfig({
      url: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_example",
      projectId: "project-ref",
    })).toEqual({
      url: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_example",
      projectId: "project-ref",
    });
    expect(projectRefFromSupabaseUrl("https://project-ref.supabase.co")).toBe("project-ref");
  });

  it.each([
    ["new secret", "sb_secret_example"],
    ["legacy service role", legacyKey("service_role")],
  ])("rejects a %s key before client creation", (_label, publishableKey) => {
    expect(() => validateBrowserSupabaseConfig({
      url: "https://project-ref.supabase.co",
      publishableKey,
      projectId: "project-ref",
    })).toThrow(/must never be shipped/i);
  });

  it.each([
    ["an unclassified value", "publishable-looking-but-unverifiable"],
    ["a malformed legacy token", "header.not-base64.signature"],
  ])("rejects %s instead of guessing that it is browser-safe", (_label, publishableKey) => {
    expect(() => validateBrowserSupabaseConfig({
      url: "https://project-ref.supabase.co",
      publishableKey,
      projectId: "project-ref",
    })).toThrow(/publishable or legacy anon/i);
  });

  it("accepts a legacy anon key but rejects a mismatched project", () => {
    expect(() => validateBrowserSupabaseConfig({
      url: "https://project-ref.supabase.co",
      publishableKey: legacyKey("anon"),
      projectId: "project-ref",
    })).not.toThrow();
    expect(() => validateBrowserSupabaseConfig({
      url: "https://project-ref.supabase.co",
      publishableKey: "sb_publishable_example",
      projectId: "different-project",
    })).toThrow(/do not match/i);
  });

  it.each([
    "http://project-ref.supabase.co",
    "https://project-ref.supabase.co/",
    "https://project-ref.supabase.co/auth",
    "https://project-ref.supabase.co?redirect=elsewhere",
    "https://project-ref.supabase.co#fragment",
    "https://user:password@project-ref.supabase.co",
    "https://project-ref.supabase.co:444",
    "https://project-ref.supabase.co.evil.example",
  ])("rejects a browser URL that is not the exact hosted HTTPS origin: %s", (url) => {
    expect(projectRefFromSupabaseUrl(url)).toBeNull();
    expect(() => validateBrowserSupabaseConfig({
      url,
      publishableKey: "sb_publishable_example",
      projectId: "project-ref",
    })).toThrow(/exact hosted HTTPS project origin/i);
  });
});
