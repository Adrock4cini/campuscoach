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

const extractor = readFileSync(resolve(
  process.cwd(),
  "supabase/functions/extract-concepts/index.ts",
), "utf8");

describe("capture -> concept -> study selection seam", () => {
  it("stores extracted concepts against the capture and its class", () => {
    expect(extractor).toContain('client_class_id: resolvedClientClassId');
    expect(extractor).toContain('capture_id: body.captureId ?? null');
    expect(extractor).toContain('.from("concepts")');
    expect(extractor).toContain('.from("processed_content")');
  });

  it("only marks the capture ready once concepts are persisted", () => {
    const readyIndex = extractor.indexOf('processing_status: "ready"');
    const conceptWriteIndex = extractor.indexOf('.from("concepts")');
    expect(conceptWriteIndex).toBeGreaterThan(-1);
    expect(readyIndex).toBeGreaterThan(-1);
    expect(extractor).toContain('processing_status: "failed"');
  });

  it("extracts supported assignment math deterministically before any model call", () => {
    expect(extractor).toContain('extractAssignmentTutorSource(rawText');
    expect(extractor).toContain("const deterministicSource = exactThinSource ?? assignmentProblemSource");
    expect(extractor.indexOf("extractAssignmentTutorSource(rawText"))
      .toBeLessThan(extractor.indexOf('fetch("https://ai.gateway.lovable.dev/v1/chat/completions"'));
    expect(extractor).toContain("if (texts.length && !deterministicSource)");
    expect(extractor).toContain('"deterministic-assignment-problem-v1"');
  });

  it("selects an explicit capture through occurrence evidence, not only the concept's first source", () => {
    expect(generator).toContain('.from("concept_capture_evidence")');
    expect(generator).toContain('.eq("capture_id", body.captureId)');
    expect(generator).toContain("conceptQuery = conceptQuery.in(\"id\", evidenceConceptIds)");
    expect(generator).toContain("body.captureId ? { ...concept, capture_id: body.captureId } : concept");
    expect(generator).not.toContain('conceptQuery = conceptQuery.eq("capture_id", body.captureId)');
    expect(generator).toContain('conceptQuery = conceptQuery.eq("client_class_id", resolvedClientClassId)');
    expect(generator).toContain("enforceClassBoundary(");
  });

  it("never revives a retired OCR-derived concept as manual study material", () => {
    const conceptQueryStart = generator.indexOf('let conceptQuery = supabase\n    .from("concepts")');
    const conceptQueryEnd = generator.indexOf("const { data: concepts", conceptQueryStart);
    const conceptQuery = generator.slice(conceptQueryStart, conceptQueryEnd);
    expect(conceptQuery).toContain('.eq("user_id", userId)');
    expect(conceptQuery).toContain('.is("retired_at", null)');
  });
});

describe("Study Intelligence edge-function contract", () => {
  it("ships the current matching and mnemonic generators", () => {
    expect(generator).toContain('from "../_shared/artifact-version.ts"');
    expect(generator).toContain("const PROMPT_VERSION = CURRENT_ARTIFACT_PROMPT_VERSION");
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
    expect(generator).toContain('const artifactWriter = createClient<EdgeDatabase>(supabaseUrl, serviceRoleKey');
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
    expect(generator).toContain("buildCapturePolicyGroundedExcerptMap(concepts, captureSources, {");
    expect(generator).toContain("if (concept.capture_id && !exactCaptureEvidence) return false");
    expect(generator).toContain("const adminClient = createClient<EdgeDatabase>(supabaseUrl, serviceRoleKey");
    expect(generator).toContain("const { data, error } = await adminClient");
    expect(generator).toContain('.from("study_memory_feedback")');
    expect(generator).toContain('.eq("user_id", userId)');
    expect(generator).toContain("mnemonicPreferences.hasFeedback");
    expect(generator).toContain("personalizedFromFeedback: true");
  });

  it("treats manual definitions as grounded and sends confusion only as routing evidence", () => {
    expect(generator).toContain("Boolean(concept.definition?.trim())");
    expect(generator).toContain("Boolean(concept.examples?.some((example) => example.trim()))");
    expect(generator).toContain("studentConfusion: body.studentConfusion");
    expect(artifactHook).toContain("studentConfusion: opts?.studentConfusion ?? null");
  });

  it("keeps a plain deterministic percent problem through both grounding gates", () => {
    expect(generator).toContain("assessSourceSufficiency(evidence).sufficient");
    expect(generator).toContain('body.kind === "practice"');
    expect(generator).toContain("requireCompletePracticeSource");
    expect(generator).toContain("confirmedAssignmentBoundary");
    expect(generator).toContain("selectCaptureGroundingSource(capture)");
    expect(generator).toContain("isTeachableAnswer(evidence)");
    expect(generator).toContain("buildAssignmentTutorPractice({");
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

  it("reads the actual course code from class metadata, never from section", () => {
    expect(generator).toContain('.select("id, client_class_id, name, term, section, professor, meta, source")');
    expect(generator).toContain("typeof metaRecord.code === \"string\"");
    expect(generator).toContain("typeof canvasMeta.courseCode === \"string\"");
    expect(generator).not.toContain("classCode: classIdentity?.section");
  });

  it("activates original ACCT 2010 foundations through a service-only boundary", () => {
    expect(generator).toContain('from "../_shared/acct-2010-runtime.ts"');
    expect(generator).toContain("shouldActivateAcct2010Map({");
    expect(generator).toContain('"ensure_acct_2010_map_concepts"');
    expect(generator).toContain("p_user_id: userId");
    expect(generator).toContain("p_class_id: classIdentity.id");
    expect(generator).toContain("serializeAcct2010ConceptSeeds(acct2010Runtime.conceptSeeds)");
    expect(generator).toContain("canonicalizeAcct2010Concepts(concepts, acct2010Runtime)");
    expect(generator).toContain('conceptQuery.or("source_kind.is.null,source_kind.neq.course-map-stable")');
    expect(generator).toContain("generatedCourseMap ? { courseMap: generatedCourseMap }");
  });
});
