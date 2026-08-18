// The edge-function helpers live outside Vitest's default src/ include. These
// imports keep the pure selection, grounding, and payload contracts in the
// normal CI test run without importing a Deno server entry point.
import "../../../supabase/functions/_shared/study-selection.test";
import "../../../supabase/functions/_shared/grounded-excerpt.test";
import "../../../supabase/functions/_shared/artifact-validation.test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const generator = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/generate-artifact/index.ts",
), "utf8");
const artifactHook = readFileSync(resolve(
  process.cwd(),
  "src/lib/learningArtifacts/useLearningArtifact.ts",
), "utf8");

describe("Study Intelligence edge-function contract", () => {
  it("ships the v9 matching and mnemonic generators", () => {
    expect(generator).toContain('const PROMPT_VERSION = "v9-study-intelligence"');
    expect(generator).toContain("matching: {");
    expect(generator).toContain("mnemonic: {");
    expect(generator).toContain("buildDeterministicMatchingPairs");
    expect(generator).toContain("buildExactMnemonicTarget");
    expect(generator).toContain("selectionEvidence: studySelectionSnapshot(");
    expect(generator).toContain("generatedConceptIds.includes(concept.id)");
    expect(generator).toContain("capture_id: body.captureId ?? null");
    expect(generator).toContain("id: `capture-${body.captureId}`");
  });

  it("consumes service-role hour and day quotas before the paid fetch", () => {
    expect(generator).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(generator).toContain('p_function_name: quota.functionName');
    expect(generator).toContain('functionName: "generate-artifact-hour"');
    expect(generator).toContain('functionName: "generate-artifact-day"');
    expect(generator.indexOf("await consumeArtifactQuota(userId)"))
      .toBeLessThan(generator.indexOf('fetch("https://ai.gateway.lovable.dev'));
    expect(generator).toContain('functionName: "generate-artifact-request-hour"');
    expect(generator).toContain('functionName: "generate-artifact-request-day"');
    expect(generator.indexOf("await consumeGenerationRequestQuota(userId)"))
      .toBeLessThan(generator.indexOf("await resolveStudyScope"));
  });

  it("keeps academic answers deterministic and reserves AI for the memory aid", () => {
    const flashStart = generator.indexOf('if (body.kind === "flashcards")');
    const choiceStart = generator.indexOf('} else if (body.kind === "multiple_choice")');
    const matchingStart = generator.indexOf('} else if (body.kind === "matching")');
    const mnemonicStart = generator.indexOf('} else {', matchingStart);
    expect(generator.slice(flashStart, choiceStart)).toContain("buildDeterministicFlashcards");
    expect(generator.slice(flashStart, choiceStart)).not.toContain("callGateway(");
    expect(generator.slice(choiceStart, matchingStart)).toContain("buildDeterministicMultipleChoice");
    expect(generator.slice(choiceStart, matchingStart)).not.toContain("callGateway(");
    expect(generator.slice(matchingStart, mnemonicStart)).toContain("buildDeterministicMatchingPairs");
    expect(generator.slice(matchingStart, mnemonicStart)).not.toContain("callGateway(");
    expect(generator.slice(mnemonicStart)).toContain("callGateway(");
    expect(generator).toContain('const artifactWriter = createClient(supabaseUrl, serviceRoleKey');
    expect(generator).toContain('await artifactWriter.from("learning_artifacts")');
  });

  it("persists and reloads the same validated coach-picked scope", () => {
    expect(generator).toContain(
      "resolveClassStudyScope(requested.id, Boolean(body.conceptIds?.length))",
    );
    expect(generator).toContain("study_scope_id: resolvedScope.id");
    expect(artifactHook).toContain('.eq("study_scope_id", scope.studyScope.id)');
  });

  it("bounds source excerpts and only personalizes after real feedback", () => {
    expect(generator).toContain("buildGroundedExcerptMap(concepts, sourceByCapture)");
    expect(generator).toContain("if (concept.capture_id && !exactCaptureEvidence) return false");
    expect(generator).toContain("const adminClient = createClient(supabaseUrl, serviceRoleKey");
    expect(generator).toContain("const { data, error } = await adminClient");
    expect(generator).toContain('.from("study_memory_feedback")');
    expect(generator).toContain('.eq("user_id", userId)');
    expect(generator).toContain("mnemonicPreferences.hasFeedback");
    expect(generator).toContain("personalizedFromFeedback: true");
  });

  it("derives a coarse, non-childish audience level from the authenticated profile", () => {
    expect(generator).toContain('.from("profiles")');
    expect(generator).toContain('.eq("user_id", userId)');
    expect(generator).toContain('data?.learner_type === "middle_school"');
    expect(generator).toContain('data?.learner_type === "high_school"');
    expect(generator).toContain('data?.learner_type === "college"');
    expect(generator).toContain("Audience level from the authenticated profile");
    expect(generator).toContain("never make the tone childish");
  });
});
