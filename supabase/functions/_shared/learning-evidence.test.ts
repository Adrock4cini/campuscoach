import { describe, expect, it } from "vitest";
import {
  evidenceMeetsTaskMinimum,
  evidenceTierForArtifact,
  targetTaskKindFromSnapshot,
} from "./learning-evidence.ts";

describe("learning evidence", () => {
  it("derives evidence tier only from the artifact kind", () => {
    expect(evidenceTierForArtifact("flashcards")).toBe("recall");
    expect(evidenceTierForArtifact("multiple_choice")).toBe("discrimination");
    expect(evidenceTierForArtifact("matching")).toBe("discrimination");
    expect(evidenceTierForArtifact("practice")).toBe("transfer");
    expect(evidenceTierForArtifact("mnemonic")).toBeNull();
  });

  it("takes the target task from the authored router snapshot", () => {
    expect(targetTaskKindFromSnapshot({ strategy: { taskKind: "solve-problems" } })).toBe("solve-problems");
    expect(targetTaskKindFromSnapshot({ strategy: { taskKind: "made-up" } })).toBeNull();
    expect(targetTaskKindFromSnapshot({})).toBeNull();
  });

  it("does not let lower-order success prove a higher-order target task", () => {
    expect(evidenceMeetsTaskMinimum("recall", "solve-problems")).toBe(false);
    expect(evidenceMeetsTaskMinimum("discrimination", "apply-procedure")).toBe(false);
    expect(evidenceMeetsTaskMinimum("application", "solve-problems")).toBe(true);
    expect(evidenceMeetsTaskMinimum("transfer", "solve-problems")).toBe(true);
    expect(evidenceMeetsTaskMinimum("recall", "memorize-terms")).toBe(true);
    expect(evidenceMeetsTaskMinimum(null, "solve-problems")).toBe(true);
  });
});
