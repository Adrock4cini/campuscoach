import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_ROUTE, resolveEntryRoute, writeLastRoute } from "./routeMemory";

describe("default landing route", () => {
  it("sends a plain sign-in / default entry to Today", () => {
    expect(resolveEntryRoute(undefined)).toBe("/dashboard");
    expect(resolveEntryRoute("/")).toBe(DEFAULT_HOME_ROUTE);
  });

  it("sends agreement completion without a destination to Today", () => {
    expect(resolveEntryRoute(null)).toBe("/dashboard");
  });

  it("preserves an intentional protected deep link", () => {
    expect(resolveEntryRoute("/assignments/abc")).toBe("/assignments/abc");
    expect(resolveEntryRoute("/study-lab?classId=1")).toBe("/study-lab?classId=1");
  });

  it("never lets the last visited tab become the permanent home", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
    writeLastRoute("/classes", storage);
    expect(resolveEntryRoute(undefined)).toBe("/dashboard");
  });

  it("rejects off-site destinations", () => {
    expect(resolveEntryRoute("https://evil.example.com")).toBe("/dashboard");
    expect(resolveEntryRoute("//evil.example.com")).toBe("/dashboard");
  });
});

describe("root gate wiring", () => {
  const app = readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");

  it("resolves the root entry to Today, not the last visited tab", () => {
    expect(app).toContain("<Navigate to={DEFAULT_HOME_ROUTE} replace />");
    expect(app).not.toContain("readLastRoute()");
  });

  it("still routes intentional deep links and the Classes tab", () => {
    expect(app).toContain('path="/classes"');
    expect(app).toContain("state={{ next: `${loc.pathname}${loc.search}` }}");
  });
});
