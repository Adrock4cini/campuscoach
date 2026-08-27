import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("invite-only indexing boundary", () => {
  it("keeps the release out of search indexes until public registration is approved", () => {
    const html = readFileSync("index.html", "utf8");
    const robots = readFileSync("public/robots.txt", "utf8");

    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    expect(robots).toMatch(/User-agent:\s*\*\s+Disallow:\s*\//);
    expect(robots).not.toContain("Allow: /");
  });
});
