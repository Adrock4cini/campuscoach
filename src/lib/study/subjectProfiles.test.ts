import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SUBJECT_PROFILES,
  classifySubject,
  getSubjectProfile,
  mergeTechniquePreferences,
  orderStudyFormats,
  subjectPromptGuidance,
} from "./subjectProfiles";

describe("subject classification", () => {
  it("uses the class name as the strongest signal", () => {
    const result = classifySubject({ className: "Algebra II", topics: ["Cell structure"] });
    expect(result.primary).toBe("math");
    expect(result.source).toBe("class-name");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("falls back to topics, then concepts, then general", () => {
    expect(classifySubject({ className: "Period 4", topics: ["Photosynthesis in biology"] }).primary)
      .toBe("life_science");
    expect(classifySubject({ className: "Block A", conceptNames: ["Baroque painting"] }).source)
      .toBe("concepts");
    const unknown = classifySubject({ className: "Advisory" });
    expect(unknown.primary).toBe("general");
    expect(unknown.confidence).toBe(0);
  });

  it("recognizes vocational and hands-on courses", () => {
    expect(classifySubject({ className: "Nail Tech Fundamentals" }).primary).toBe("life_science");
    expect(classifySubject({ className: "Culinary Arts 1" }).primary).toBe("culinary");
    expect(classifySubject({ className: "Intro to Accounting" }).primary).toBe("business_accounting");
  });
});

describe("subject strategy application", () => {
  it("puts the profile's best format first without dropping any format", () => {
    const all = ["flashcards", "multiple_choice", "matching"] as const;
    expect(orderStudyFormats("math", all)[0]).toBe("multiple_choice");
    expect(orderStudyFormats("life_science", all)[0]).toBe("flashcards");
    expect(orderStudyFormats("general", all)).toHaveLength(3);
    expect(new Set(orderStudyFormats("culinary", all))).toEqual(new Set(all));
  });

  it("avoids ill-fitting techniques but never overrides student feedback", () => {
    const cold = mergeTechniquePreferences("math", { hasFeedback: false, preferred: [], avoid: [] });
    expect(cold.avoid).toContain("word_roots");
    expect(cold.preferred).toContain("worked_example");

    const warm = mergeTechniquePreferences("math", {
      hasFeedback: true,
      preferred: ["word_roots"],
      avoid: ["worked_example"],
    });
    expect(warm.avoid).not.toContain("word_roots");
    expect(warm.avoid).toContain("worked_example");
    expect(warm.preferred[0]).toBe("word_roots");
    expect(warm.preferred).not.toContain("worked_example");
  });

  it("emits grounded, non-fabricating prompt guidance for every profile", () => {
    for (const profile of Object.values(SUBJECT_PROFILES)) {
      const line = subjectPromptGuidance(profile.id);
      expect(line).toContain(profile.label);
      expect(line.length).toBeLessThan(600);
    }
    expect(subjectPromptGuidance("math")).toMatch(/[Nn]ever invent/);
    expect(getSubjectProfile(undefined).id).toBe("general");
  });
});

describe("generator wiring", () => {
  const generator = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-artifact/index.ts"),
    "utf8",
  );

  it("classifies from the student's own class and scope, then steers the prompt", () => {
    expect(generator).toContain('from "../_shared/subject-profiles.ts"');
    expect(generator).toContain("const subject = classifySubject({");
    expect(generator).toContain("subjectPromptGuidance(subjectProfileId)");
    expect(generator).toContain("mergeTechniquePreferences(subject.primary, mnemonicPreferences)");
    expect(generator).toContain("subjectProfile: {");
  });

  it("keeps subject adaptation off the deterministic academic answers", () => {
    const flashStart = generator.indexOf('if (body.kind === "flashcards")');
    const matchingEnd = generator.indexOf('} else {', generator.indexOf('} else if (body.kind === "matching")'));
    expect(generator.slice(flashStart, matchingEnd)).not.toContain("subjectPromptGuidance");
  });
});
