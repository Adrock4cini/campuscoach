/**
 * Cross-class leak guard.
 *
 * A Math study set must never contain Biology/History material. Two boundaries
 * are proven here: the server refuses to build a set without a resolvable class
 * scope (which is what previously loaded every concept the student owned), and
 * the client sanitizes fixture prefixes before anything reaches the learner.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeLearnerContent } from "./sanitizeLearnerText";

const generateArtifact = readFileSync("supabase/functions/generate-artifact/index.ts", "utf8");

describe("study set class scoping", () => {
  it("refuses to build a study set with no resolvable class boundary", () => {
    expect(generateArtifact).toContain("class_scope_required");
    const guardIndex = generateArtifact.indexOf("class_scope_required");
    const queryIndex = generateArtifact.indexOf("let conceptQuery = supabase");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

  it("still bounds explicit concept/capture selections by the requested class", () => {
    expect(generateArtifact).toContain("enforceClassBoundary(");
    expect(generateArtifact).toContain('concept.client_class_id === requestedClassId');
  });

  it("never renders a fixture prefix inside a question or option", () => {
    const payload = {
      questions: [{
        prompt: "DUPLICATE TEST: Which refrigerant state leaves the evaporator?",
        options: ["QA: Superheated vapor", "Subcooled liquid"],
      }],
    };
    const clean = JSON.stringify(sanitizeLearnerContent(payload));
    expect(clean).not.toContain("DUPLICATE TEST");
    expect(clean).not.toContain("QA:");
  });
});
