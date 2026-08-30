import { describe, it } from "vitest";
import { extractAssignmentTutorSource, buildAssignmentTutorPractice } from "../supabase/functions/_shared/assignment-tutor";
describe("probe", () => {
  it("probes", () => {
    for (const s of ["What is 14% of 50?", "A jacket costs $80. It is 25% off. What is the sale price?", "A jacket costs $80. It is 25% off. What is the sale price"]) {
      const e = extractAssignmentTutorSource(s);
      console.log(JSON.stringify(s), "extract:", e ? JSON.stringify(e.concepts.map(c=>c.name)) : null);
      if (e) {
        const p = buildAssignmentTutorPractice({conceptId:"x",conceptName:e.concepts[0].name,sourceExcerpt:s});
        console.log("  supported:", p.supported, p.supported ? "" : JSON.stringify(p));
      }
    }
  });
});
