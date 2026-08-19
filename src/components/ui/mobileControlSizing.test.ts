import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("mobile control sizing", () => {
  it("keeps common buttons and form controls at least 44px tall", () => {
    expect(source("src/components/ui/button.tsx")).toMatch(/default: "h-11/);
    expect(source("src/components/ui/button.tsx")).toMatch(/sm: "h-11/);
    expect(source("src/components/ui/button.tsx")).toMatch(/icon: "h-11 w-11/);
    expect(source("src/components/ui/input.tsx")).toContain("h-11");
    expect(source("src/components/ui/select.tsx")).toContain("h-11");
    expect(source("src/components/ui/dialog.tsx")).toContain("h-11 w-11");
    expect(source("src/components/real/RealClassAssignmentsExams.tsx")).toContain("h-11 w-11");
  });

  it("uses 16px mobile textarea text so iPhone Safari does not zoom the form", () => {
    expect(source("src/components/ui/textarea.tsx")).toContain("text-base");
    expect(source("src/components/ui/textarea.tsx")).toContain("md:text-sm");
  });
});
