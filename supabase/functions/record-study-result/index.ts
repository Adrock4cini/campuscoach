// Sprint C — Feedback loop.
//
// A real student just studied a `learning_artifacts` row. Persist the
// result so the Concept memory (`user_concept_mastery`) permanently
// reflects what they now know better, and recompute class readiness.
//
// Concepts are the permanent memory. Learning artifacts are disposable
// views. We update the memory here, never the artifact.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.1/cors";
import { CURRENT_ARTIFACT_PROMPT_VERSION } from "../_shared/artifact-version.ts";
import { studyAttemptDisposition } from "../_shared/retry-integrity.ts";
import { executedStrategyOutcomeMetadata } from "../_shared/strategy-outcome.ts";
import {
  evidenceTierForArtifact,
  isLearningEvidenceTier,
  isTeachingTaskKind,
  targetTaskKindFromSnapshot,
  type TeachingTaskKind,
} from "../_shared/learning-evidence.ts";
import type { LearningEvidenceTier } from "../_shared/strategy-evidence.ts";
import { examReadinessScopeFromSnapshot } from "../_shared/readiness-scope.ts";
import {
  gradeMatchingFirstChoices,
  gradeMultipleChoiceSelections,
  type MatchingFirstChoice,
} from "../_shared/discrimination-grading.ts";
import {
  aggregateStudyRunSegments,
  parseStudyRunContract,
  summarizeAuthoritativeStudyRunEvidence,
  type GroupedStudyRunSegment,
  type StoredStudyRunConceptEvidence,
  type StoredStudyRunSegment,
} from "../_shared/study-run.ts";
import { buildAssignmentTutorPractice } from "../_shared/assignment-tutor.ts";
import { canonicalJsonStringify } from "../_shared/canonical-json.ts";
import {
  checkStudyWritesPaused,
  STUDY_WRITES_PAUSED_RESPONSE,
} from "../_shared/study-write-pause.ts";
import {
  checkCurrentFamilyBetaAgreement,
  CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
  FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE,
  FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE,
} from "../_shared/family-beta-agreement.ts";
import {
  logPrivateFailure,
  privateJsonResponse,
  privateResponseHeaders,
  withPrivateJsonErrors,
} from "../_shared/private-json-response.ts";

type ConfidenceLevel = "low" | "medium" | "high";

interface PerConcept {
  conceptId: string;
  correct: boolean;
  confidence?: ConfidenceLevel;
  recovered?: boolean;
  /** Required for current MC evidence; correctness is server-derived. */
  firstSelectedIndex?: number;
}

interface Body {
  attemptId?: string;
  studyRunId?: string;
  segmentIndex?: number;
  segmentFinal?: boolean;
  artifactId: string;
  correct?: number;
  total?: number;
  durationSeconds: number;
  perConcept?: PerConcept[];
  /** Required for current Match Lab evidence; correctness is server-derived. */
  matchingFirstChoices?: MatchingFirstChoice[];
  /** Practice is graded against the stored transfer problem, never by the client. */
  selectedIndex?: number;
  confidence?: ConfidenceLevel;
  /** The first independent check is immutable in the client replay payload. */
  firstSelectedIndex?: number;
  firstConfidence?: ConfidenceLevel;
}

interface VerifiedPracticeGradingSnapshot {
  version: 1;
  conceptId: string;
  answerIndex: number;
  choiceCount: number;
  selectedIndex: number;
  confidence: ConfidenceLevel;
  correct: boolean;
  challengeFingerprint: string;
  resultRequestHash: string;
}

interface StudyResultAttemptRow {
  artifact_id: string;
  challenge_fingerprint: string | null;
  client_request_hash: string | null;
  verified_grading_snapshot: unknown;
  result_status: string;
  result_payload: unknown;
  result_request_hash: string;
  lease_token: string;
  lease_started_at: string;
  duration_seconds: number;
  session_id: string | null;
  completed_at: string | null;
  evidence_contract_version: number | null;
  evidence_tier: LearningEvidenceTier | null;
  target_task_kind: TeachingTaskKind | null;
  readiness_projection: unknown;
  study_run_id: string | null;
  study_run_segment: number | null;
  study_run_final: boolean | null;
  study_run_correct: number | null;
  study_run_total: number | null;
  study_run_concept_ids: string[] | null;
}

interface StudyRunRow {
  id: string;
  user_id: string;
  artifact_id: string;
  evidence_contract_version: number;
  result_status: string;
  final_segment_index: number | null;
  session_id: string | null;
  completed_at: string | null;
}

interface ReadinessProjection {
  readiness: number;
  readinessBefore: number;
}

interface LegacyReadinessProjection {
  readiness: number | null;
  readinessBefore: number | null;
}

interface PracticeMasteryReservation {
  applied: boolean;
  previousStrength: number;
  resultingStrength: number;
}

interface PracticeCaptureBoundaryRow {
  id: string;
  assignment_id: string | null;
  class_id: string | null;
  client_class_id: string | null;
  kind: string;
  processing_status: string;
  concept_extraction_claim_id: string | null;
  practice_source_status: string | null;
  practice_source_text: string | null;
  practice_source_version: number;
  practice_source_hash: string | null;
  practice_concept_id: string | null;
}

interface PracticeAssignmentBoundaryRow {
  id: string;
  class_id: string | null;
  client_class_id: string | null;
}

interface PracticeChallengeOwnerRow {
  result_status: string;
  lease_started_at: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_KINDS = new Set(["flashcards", "multiple_choice", "matching", "practice"]);
const EVIDENCE_CONTRACT_VERSION = 2;
const ATTEMPT_SELECT = "artifact_id, challenge_fingerprint, client_request_hash, verified_grading_snapshot, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at, evidence_contract_version, evidence_tier, target_task_kind, readiness_projection, study_run_id, study_run_segment, study_run_final, study_run_correct, study_run_total, study_run_concept_ids";
const STUDY_RUN_SELECT = "id, user_id, artifact_id, evidence_contract_version, result_status, final_segment_index, session_id, completed_at";

Deno.serve((req) => withPrivateJsonErrors(req, corsHeaders, async (requestId) => {
  const json = (body: unknown, status = 200) => (
    privateJsonResponse(body, status, corsHeaders, { requestId })
  );
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: privateResponseHeaders(corsHeaders, requestId) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Study saving is temporarily unavailable" }, 503);
  }
  const supabase = createClient(
    supabaseUrl,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );
  const jwt = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(jwt);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const agreementGate = await checkCurrentFamilyBetaAgreement(userId, () =>
    adminClient
      .from("family_beta_agreement_acceptances")
      .select("user_id, accepted_by, agreement_version, accepted_at")
      .eq("user_id", userId)
      .eq("agreement_version", CURRENT_FAMILY_BETA_AGREEMENT_VERSION)
      .maybeSingle()
  );
  if (!agreementGate.allowed) {
    if (agreementGate.lookupFailed) {
      logPrivateFailure({ errorClass: "agreement_check_unavailable", status: 503, requestId });
      return json(FAMILY_BETA_AGREEMENT_UNAVAILABLE_RESPONSE, 503);
    }
    return json(FAMILY_BETA_AGREEMENT_REQUIRED_RESPONSE, 403);
  }
  const pauseGate = await checkStudyWritesPaused(
    () => adminClient.rpc("get_study_write_pause"),
  );
  if (pauseGate.blocked) {
    if (pauseGate.lookupFailed) {
      logPrivateFailure({
        errorClass: "pause_control_unavailable",
        status: 503,
        requestId,
      });
    }
    return json(STUDY_WRITES_PAUSED_RESPONSE, 503);
  }

  let parsedBody: unknown;
  try { parsedBody = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!isRecord(parsedBody)) return json({ error: "JSON body must be an object" }, 400);
  if (Object.hasOwn(parsedBody, "evidenceTier")
      || Object.hasOwn(parsedBody, "evidence_tier")
      || Object.hasOwn(parsedBody, "targetTaskKind")
      || Object.hasOwn(parsedBody, "target_task_kind")
      || Object.hasOwn(parsedBody, "evidenceContractVersion")
      || Object.hasOwn(parsedBody, "evidence_contract_version")) {
    return json({ error: "evidence classification is server-derived" }, 400);
  }
  const body = parsedBody as unknown as Body;
  const studyRunContract = parseStudyRunContract(parsedBody);
  if (studyRunContract.kind === "invalid") {
    return json({ error: studyRunContract.error }, 400);
  }

  if (typeof body.artifactId !== "string" || !UUID_PATTERN.test(body.artifactId)) {
    return json({ error: "artifactId required" }, 400);
  }
  if (!Number.isFinite(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > 86_400) {
    return json({ error: "durationSeconds must be between 0 and 86400" }, 400);
  }
  if (body.perConcept !== undefined && !Array.isArray(body.perConcept)) {
    return json({ error: "perConcept must be an array" }, 400);
  }
  if (body.attemptId && !UUID_PATTERN.test(body.attemptId)) {
    return json({ error: "attemptId must be a UUID" }, 400);
  }
  if (studyRunContract.kind === "grouped" && !body.attemptId) {
    return json({ error: "attemptId is required for grouped study results" }, 400);
  }

  // The client reuses this id after a lost response.
  const attemptId = body.attemptId ?? crypto.randomUUID();

  // 1. Load artifact (RLS enforces ownership).
  const { data: artifact, error: aErr } = await supabase
    .from("learning_artifacts")
    .select("id, user_id, class_id, client_class_id, concept_ids, capture_id, topic, kind, payload, model, prompt_version, stale, study_scope_type, study_scope_id, study_scope_label, study_scope_snapshot")
    .eq("id", body.artifactId)
    .maybeSingle();
  if (aErr) return json({ error: "artifact load failed" }, 500);
  if (!artifact) return json({ error: "artifact not found" }, 404);
  if (!SUPPORTED_KINDS.has(artifact.kind)) {
    return json({ error: "This study set must be refreshed before results can be saved" }, 409);
  }
  if (studyRunContract.kind === "grouped" && artifact.kind === "practice") {
    return json({ error: "assignment practice results cannot be segmented" }, 400);
  }

  // Read the immutable attempt ledger before active-concept gating. An exact
  // retry may legitimately finish history repair after its source concept was
  // retired, but a new result may never add evidence to retired memory.
  const { data: priorAttemptData, error: priorErr } = await adminClient
    .from("study_result_attempts")
    .select(`user_id, client_attempt_id, ${ATTEMPT_SELECT}`)
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .maybeSingle();
  if (priorErr) return json({ error: "attempt lookup failed" }, 500);
  const priorAttempt = priorAttemptData as StudyResultAttemptRow | null;

  const artifactEvidenceTier = evidenceTierForArtifact(artifact.kind);
  const artifactTargetTaskKind = targetTaskKindFromSnapshot(artifact.study_scope_snapshot);
  const legacyPriorAttempt = Boolean(
    priorAttempt && priorAttempt.evidence_contract_version === null,
  );
  if (priorAttempt && !legacyPriorAttempt && (
    priorAttempt.evidence_contract_version !== EVIDENCE_CONTRACT_VERSION
    || !isLearningEvidenceTier(priorAttempt.evidence_tier)
    || !isTeachingTaskKind(priorAttempt.target_task_kind)
  )) {
    return json({ error: "study result evidence contract is invalid" }, 409);
  }
  if (!priorAttempt && (!artifactEvidenceTier || !artifactTargetTaskKind)) {
    return json({ error: "This study set must be refreshed before results can be saved" }, 409);
  }
  const evidenceContractVersion = legacyPriorAttempt ? null : EVIDENCE_CONTRACT_VERSION;
  const evidenceTier = legacyPriorAttempt
    ? null
    : priorAttempt?.evidence_tier ?? artifactEvidenceTier!;
  const targetTaskKind = legacyPriorAttempt
    ? null
    : priorAttempt?.target_task_kind ?? artifactTargetTaskKind!;

  const itemConceptIds = artifactItemConceptIds(artifact.kind, artifact.payload);
  if (!itemConceptIds) return json({ error: "study set payload is invalid" }, 409);
  const minimumItems = artifact.kind === "matching" ? 3 : 1;
  const maximumItems = artifact.kind === "matching" ? 6 : artifact.kind === "practice" ? 1 : 8;
  if (itemConceptIds.length < minimumItems || itemConceptIds.length > maximumItems) {
    return json({ error: "study set item count is invalid" }, 409);
  }
  if (!Array.isArray(artifact.concept_ids)
      || artifact.concept_ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return json({ error: "study set concepts are invalid" }, 409);
  }
  const conceptIds: string[] = [...new Set<string>(artifact.concept_ids)];
  if (artifact.kind === "practice" && artifact.concept_ids.length !== 1) {
    return json({ error: "practice study set must contain exactly one concept" }, 409);
  }
  if (conceptIds.length !== itemConceptIds.length
      || conceptIds.some((id) => !itemConceptIds.includes(id))) {
    return json({ error: "study set concepts do not match its questions" }, 409);
  }
  // 2. Load concepts to resolve real (uuid) class_id.
  const { data: concepts, error: cErr } = await supabase
    .from("concepts")
    .select("id, name, class_id, client_class_id, capture_id, retired_at")
    .eq("user_id", userId)
    .in("id", conceptIds);
  if (cErr) return json({ error: "concept load failed" }, 500);
  if (!concepts || concepts.length !== conceptIds.length) {
    return json({ error: "study set contains unavailable concepts" }, 409);
  }
  if (!priorAttempt && concepts.some((concept) => concept.retired_at !== null)) {
    return json({ error: "This study set contains a superseded concept and must be refreshed" }, 409);
  }

  const realClassId: string | null = concepts[0]?.class_id ?? null;
  const clientClassId: string | null = concepts[0]?.client_class_id ?? null;
  if (concepts.some((concept) => (
    concept.class_id !== realClassId || concept.client_class_id !== clientClassId
  ))) {
    return json({ error: "study set crosses class boundaries" }, 409);
  }
  if (artifact.class_id !== realClassId || artifact.client_class_id !== clientClassId) {
    return json({ error: "study set class does not match its concepts" }, 409);
  }

  const examReadinessScopeIds = artifact.study_scope_type === "exam"
    ? examReadinessScopeFromSnapshot(artifact.study_scope_snapshot)
    : null;
  if (!priorAttempt && artifact.study_scope_type === "exam") {
    if (!UUID_PATTERN.test(artifact.study_scope_id)
        || !examReadinessScopeIds
        || conceptIds.some((conceptId) => !examReadinessScopeIds.includes(conceptId))) {
      return json({ error: "This exam study set must be refreshed before results can be saved" }, 409);
    }
    // Validate the live assessment before reserving an attempt or applying any
    // mastery. The atomic projection repeats this check under the class/exam
    // row locks so an archive race cannot publish an exam readiness value.
    const { data: activeExam, error: activeExamError } = await supabase
      .from("exams")
      .select("id, class_id, client_class_id")
      .eq("user_id", userId)
      .eq("id", artifact.study_scope_id)
      .is("source_archived_at", null)
      .maybeSingle();
    if (activeExamError) return json({ error: "exam scope could not be verified" }, 500);
    const examMatchesClass = Boolean(activeExam) && (realClassId
      ? activeExam!.class_id === realClassId
        || (activeExam!.class_id === null && activeExam!.client_class_id === clientClassId)
      : activeExam!.class_id === null && activeExam!.client_class_id === clientClassId);
    if (!examMatchesClass) {
      return json({ error: "This exam study set must be refreshed before results can be saved" }, 409);
    }
    const { data: examScopeConcepts, error: examScopeError } = await supabase
      .from("concepts")
      .select("id, class_id, client_class_id, retired_at")
      .eq("user_id", userId)
      .in("id", examReadinessScopeIds);
    if (examScopeError) return json({ error: "exam readiness scope could not be verified" }, 500);
    if (!examScopeConcepts || examScopeConcepts.length !== examReadinessScopeIds.length
        || examScopeConcepts.some((concept) => (
          concept.retired_at !== null
          || !(realClassId
            ? concept.class_id === realClassId
              || (concept.class_id === null && concept.client_class_id === clientClassId)
            : concept.class_id === null && concept.client_class_id === clientClassId)
        ))) {
      return json({ error: "This exam study set must be refreshed before results can be saved" }, 409);
    }
  }

  const claimedAt = new Date().toISOString();
  const leaseToken = crypto.randomUUID();
  let practiceClientRequestHash: string | null = null;
  if (artifact.kind === "practice") {
    if (!body.attemptId) return json({ error: "practice attemptId is required" }, 400);
    if (!isNonNegativeInteger(body.selectedIndex)
        || !isNonNegativeInteger(body.firstSelectedIndex)
        || !isConfidenceLevel(body.confidence)
        || !isConfidenceLevel(body.firstConfidence)) {
      return json({ error: "practice response must include valid first and final selections with confidence" }, 400);
    }
    if (body.selectedIndex !== body.firstSelectedIndex
        || body.confidence !== body.firstConfidence) {
      return json({ error: "practice results must record the first independent check before feedback" }, 400);
    }
    practiceClientRequestHash = await practiceResultClientRequestHash({
      artifactId: body.artifactId,
      selectedIndex: body.selectedIndex,
      confidence: body.confidence,
      firstSelectedIndex: body.firstSelectedIndex,
      firstConfidence: body.firstConfidence,
    });
  }

  // Validate all student-supplied result details before reserving an attempt.
  // A rejected body must never leave a durable session stuck in `processing`.
  const perMap = new Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
    firstSelectedIndex?: number;
    firstLeftPairId?: string;
    firstSelectedPairId?: string;
  }>();
  let correct: number;
  let total: number;
  let selectedIndex: number | undefined;
  let firstSelectedIndex: number | undefined;
  let practiceChallengeMaterial: string | null = null;
  let verifiedPracticeSnapshot: VerifiedPracticeGradingSnapshot | null = null;
  if (artifact.kind === "practice") {
    selectedIndex = body.selectedIndex as number;
    firstSelectedIndex = body.firstSelectedIndex as number;
    const practiceConfidence = body.firstConfidence as ConfidenceLevel;
    let firstCorrect: boolean;
    if (priorAttempt) {
      verifiedPracticeSnapshot = parseVerifiedPracticeGradingSnapshot(
        priorAttempt.verified_grading_snapshot,
      );
      if (priorAttempt.artifact_id !== body.artifactId
          || priorAttempt.client_request_hash !== practiceClientRequestHash
          || !verifiedPracticeSnapshot
          || verifiedPracticeSnapshot.conceptId !== conceptIds[0]
          || verifiedPracticeSnapshot.selectedIndex !== selectedIndex
          || verifiedPracticeSnapshot.confidence !== practiceConfidence
          || priorAttempt.result_request_hash !== verifiedPracticeSnapshot.resultRequestHash
          || priorAttempt.challenge_fingerprint !== verifiedPracticeSnapshot.challengeFingerprint) {
        return json({ error: "attemptId already belongs to a different study result" }, 409);
      }
      firstCorrect = verifiedPracticeSnapshot.correct;
    } else {
      const transfer = canonicalPracticeTransfer(artifact);
      if (!transfer) return json({ error: "practice transfer payload is invalid" }, 409);
      if (selectedIndex >= transfer.choiceCount || firstSelectedIndex >= transfer.choiceCount) {
        return json({ error: "practice response must include valid first and final selections with confidence" }, 400);
      }
      practiceChallengeMaterial = transfer.challengeMaterial;
      firstCorrect = firstSelectedIndex === transfer.answerIndex;
      verifiedPracticeSnapshot = {
        version: 1,
        conceptId: conceptIds[0],
        answerIndex: transfer.answerIndex,
        choiceCount: transfer.choiceCount,
        selectedIndex: firstSelectedIndex,
        confidence: practiceConfidence,
        correct: firstCorrect,
        challengeFingerprint: "",
        resultRequestHash: "",
      };
    }

    correct = firstCorrect ? 1 : 0;
    total = 1;
    perMap.set(conceptIds[0], {
      correct: correct === 1,
      confidence: practiceConfidence,
      recovered: false,
    });
  } else {
    if (typeof body.total !== "number" || typeof body.correct !== "number") {
      return json({ error: "artifactId, correct, total required" }, 400);
    }
    if (!Number.isInteger(body.total) || !Number.isInteger(body.correct)
        || body.total <= 0 || body.total > itemConceptIds.length
        || body.correct < 0 || body.correct > body.total) {
      return json({ error: "correct and total must be valid whole-number results" }, 400);
    }
    if (!body.perConcept || body.perConcept.length !== body.total) {
      return json({ error: "perConcept must score every submitted item" }, 400);
    }
    const allowed = new Set(conceptIds);
    for (const rawResult of body.perConcept as unknown[]) {
      if (!isRecord(rawResult)) {
        return json({ error: "perConcept contains an invalid or duplicate result" }, 400);
      }
      const p = rawResult as unknown as PerConcept;
      const confidence = p.confidence ?? "medium";
      const currentMultipleChoice = artifact.kind === "multiple_choice"
        && evidenceContractVersion === EVIDENCE_CONTRACT_VERSION;
      if (typeof p.conceptId !== "string"
          || !UUID_PATTERN.test(p.conceptId)
          || !allowed.has(p.conceptId)
          || perMap.has(p.conceptId)
          || !["low", "medium", "high"].includes(confidence)
          || typeof p.correct !== "boolean"
          || (p.recovered !== undefined && typeof p.recovered !== "boolean")
          || (p.recovered === true && p.correct === true)
          || (currentMultipleChoice && !isNonNegativeInteger(p.firstSelectedIndex))
          || (!currentMultipleChoice && p.firstSelectedIndex !== undefined)) {
        return json({ error: "perConcept contains an invalid or duplicate result" }, 400);
      }
      perMap.set(p.conceptId, {
        correct: p.correct,
        confidence,
        recovered: p.recovered === true,
        ...(currentMultipleChoice ? { firstSelectedIndex: p.firstSelectedIndex } : {}),
      });
    }
    correct = body.correct;
    total = body.total;

    if (artifact.kind === "multiple_choice"
        && evidenceContractVersion === EVIDENCE_CONTRACT_VERSION) {
      if (body.matchingFirstChoices !== undefined) {
        return json({ error: "multiple-choice grading evidence is invalid" }, 400);
      }
      const graded = gradeMultipleChoiceSelections(
        artifact.payload,
        [...perMap].map(([conceptId, result]) => ({
          conceptId,
          firstSelectedIndex: result.firstSelectedIndex!,
        })),
      );
      if (!graded.ok) return json({ error: graded.reason }, 400);
      for (const grade of graded.grades) {
        const submitted = perMap.get(grade.conceptId);
        if (!submitted || submitted.correct !== grade.correct) {
          return json({ error: "multiple-choice result does not match its stored question" }, 400);
        }
        perMap.set(grade.conceptId, {
          ...submitted,
          correct: grade.correct,
          firstSelectedIndex: grade.firstSelectedIndex,
        });
      }
      correct = graded.grades.filter((grade) => grade.correct).length;
      total = graded.grades.length;
    } else if (artifact.kind === "matching"
        && evidenceContractVersion === EVIDENCE_CONTRACT_VERSION) {
      if (!Array.isArray(body.matchingFirstChoices) || !isConfidenceLevel(body.confidence)) {
        return json({ error: "matching result must include first pair choices and confidence" }, 400);
      }
      const graded = gradeMatchingFirstChoices(artifact.payload, body.matchingFirstChoices);
      if (!graded.ok) return json({ error: graded.reason }, 400);
      const derivedMap = new Map<string, {
        correct: boolean;
        confidence: ConfidenceLevel;
        recovered: boolean;
        firstLeftPairId: string;
        firstSelectedPairId: string;
      }>();
      for (const grade of graded.grades) {
        const submitted = perMap.get(grade.conceptId);
        const recovered = !grade.correct;
        if (!submitted
            || submitted.correct !== grade.correct
            || submitted.confidence !== body.confidence
            || submitted.recovered !== recovered) {
          return json({ error: "matching result does not match its stored pairs" }, 400);
        }
        derivedMap.set(grade.conceptId, {
          correct: grade.correct,
          confidence: body.confidence,
          recovered,
          firstLeftPairId: grade.leftPairId,
          firstSelectedPairId: grade.rightPairId,
        });
      }
      perMap.clear();
      for (const [conceptId, result] of derivedMap) perMap.set(conceptId, result);
      correct = graded.grades.filter((grade) => grade.correct).length;
      total = graded.grades.length;
    } else if (body.matchingFirstChoices !== undefined) {
      return json({ error: "matching grading evidence is invalid" }, 400);
    }

    if (body.correct !== correct || body.total !== total
        || [...perMap.values()].filter((result) => result.correct).length !== correct) {
      return json({ error: "correct and perConcept results do not match" }, 400);
    }
  }
  const scoredConceptIds = [...perMap.keys()];
  if (priorAttempt && !attemptMatchesStudyRunContract(
    priorAttempt,
    studyRunContract.kind === "grouped"
      ? { ...studyRunContract, conceptIds: scoredConceptIds }
      : null,
    correct,
    total,
  )) {
    return json({ error: "attemptId already belongs to a different study result" }, 409);
  }

  const scorePct = Math.round((correct / total) * 100);
  let requestHash: string;
  let practiceChallengeFingerprint: string | null;
  if (artifact.kind === "practice" && priorAttempt && verifiedPracticeSnapshot) {
    requestHash = verifiedPracticeSnapshot.resultRequestHash;
    practiceChallengeFingerprint = verifiedPracticeSnapshot.challengeFingerprint;
  } else {
    requestHash = await studyResultRequestHash(
      body.artifactId,
      correct,
      total,
      perMap,
      selectedIndex,
      firstSelectedIndex,
      evidenceContractVersion === EVIDENCE_CONTRACT_VERSION
        ? { evidenceTier: evidenceTier!, targetTaskKind: targetTaskKind! }
        : undefined,
      studyRunContract.kind === "grouped"
        ? {
            ...studyRunContract,
            durationSeconds: Math.trunc(body.durationSeconds),
          }
        : undefined,
    );
    practiceChallengeFingerprint = practiceChallengeMaterial
      ? await sha256Hex(practiceChallengeMaterial)
      : null;
    if (artifact.kind === "practice" && verifiedPracticeSnapshot
        && practiceChallengeFingerprint) {
      verifiedPracticeSnapshot.resultRequestHash = requestHash;
      verifiedPracticeSnapshot.challengeFingerprint = practiceChallengeFingerprint;
    }
  }
  type CompletedAttemptForRepair = {
    result_status: string;
    result_payload: unknown;
    completed_at: string | null;
    session_id: string | null;
    duration_seconds: number;
  };
  const repairCompletedSession = async (completed: CompletedAttemptForRepair) => {
    if (completed.result_status !== "completed" || !completed.completed_at
        || !isRecord(completed.result_payload)) {
      return { ok: false as const };
    }

    if (studyRunContract.kind === "grouped") {
      const runId = studyRunContract.studyRunId;
      if (completed.session_id !== runId) return { ok: false as const };
      const { data: rawRunAttempts, error: runAttemptsError } = await adminClient
        .from("study_result_attempts")
        .select("client_attempt_id, study_run_segment, study_run_final, study_run_correct, study_run_total, result_status, duration_seconds, completed_at")
        .eq("study_run_id", runId)
        .eq("user_id", userId)
        .eq("artifact_id", artifact.id)
        .order("study_run_segment", { ascending: true });
      if (runAttemptsError || !rawRunAttempts?.length) return { ok: false as const };
      const runAttempts: Array<StoredStudyRunSegment & { completedAt: string | null }> = [];
      for (const rawAttempt of rawRunAttempts) {
        if (typeof rawAttempt.client_attempt_id !== "string"
            || !UUID_PATTERN.test(rawAttempt.client_attempt_id)
            || !Number.isInteger(rawAttempt.study_run_segment)
            || typeof rawAttempt.study_run_final !== "boolean"
            || !Number.isInteger(rawAttempt.study_run_correct)
            || !Number.isInteger(rawAttempt.study_run_total)
            || typeof rawAttempt.result_status !== "string"
            || !Number.isInteger(rawAttempt.duration_seconds)
            || (rawAttempt.completed_at !== null && typeof rawAttempt.completed_at !== "string")) {
          return { ok: false as const };
        }
        runAttempts.push({
          clientAttemptId: rawAttempt.client_attempt_id,
          segmentIndex: rawAttempt.study_run_segment as number,
          segmentFinal: rawAttempt.study_run_final,
          resultStatus: rawAttempt.result_status,
          correct: rawAttempt.study_run_correct as number,
          total: rawAttempt.study_run_total as number,
          durationSeconds: rawAttempt.duration_seconds as number,
          completedAt: rawAttempt.completed_at,
        });
      }
      const aggregate = aggregateStudyRunSegments(runAttempts);
      if (!aggregate) return { ok: false as const };
      const completedAttemptIds = runAttempts
        .filter((row) => row.resultStatus === "completed")
        .map((row) => row.clientAttemptId);
      const { data: rawEvidenceRows, error: evidenceRowsError } = await adminClient
        .from("study_result_concept_updates")
        .select("client_attempt_id, concept_id, answer_correct, previous_strength, resulting_strength")
        .eq("user_id", userId)
        .in("client_attempt_id", completedAttemptIds);
      if (evidenceRowsError) return { ok: false as const };
      const authoritativeEvidence: StoredStudyRunConceptEvidence[] = [];
      for (const row of rawEvidenceRows ?? []) {
        if (typeof row.client_attempt_id !== "string"
            || typeof row.concept_id !== "string"
            || typeof row.answer_correct !== "boolean") {
          return { ok: false as const };
        }
        authoritativeEvidence.push({
          clientAttemptId: row.client_attempt_id,
          conceptId: row.concept_id,
          correct: row.answer_correct,
        });
      }
      const evidenceSummary = summarizeAuthoritativeStudyRunEvidence(
        runAttempts,
        authoritativeEvidence,
        conceptIds,
      );
      if (!evidenceSummary || (aggregate.complete && !evidenceSummary.coverageComplete)) {
        return { ok: false as const };
      }
      const finalAttempt = aggregate.complete
        ? runAttempts.find((row) => row.segmentIndex === aggregate.finalSegmentIndex) ?? null
        : null;
      if (aggregate.complete && (!finalAttempt?.completedAt || !finalAttempt.segmentFinal)) {
        return { ok: false as const };
      }

      const canonicalPayload = { ...completed.result_payload, sessionId: runId };
      const historyPayload = {
        schemaVersion: 2,
        studyRunId: runId,
        sessionId: runId,
        correct: evidenceSummary.correct,
        total: evidenceSummary.total,
        segmentCount: aggregate.segmentCount,
        complete: aggregate.complete,
      };
      const { data: repairedHistory, error: historyError } = await adminClient
        .from("study_sessions")
        .update({
          result_status: aggregate.complete ? "completed" : "processing",
          result_payload: historyPayload,
          duration_minutes: Math.max(1, Math.round(aggregate.durationSeconds / 60)),
          score: evidenceSummary.score,
          ended_at: aggregate.complete ? finalAttempt!.completedAt : null,
        })
        .eq("id", runId)
        .eq("study_run_id", runId)
        .eq("user_id", userId)
        .eq("artifact_id", artifact.id)
        .eq("client_attempt_id", runId)
        .is("result_request_hash", null)
        .select("id")
        .maybeSingle();
      if (historyError || repairedHistory?.id !== runId) return { ok: false as const };

      const { data: relinked, error: relinkError } = await adminClient
        .from("study_result_attempts")
        .update({
          result_payload: canonicalPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("client_attempt_id", attemptId)
        .eq("artifact_id", artifact.id)
        .eq("study_run_id", runId)
        .eq("result_request_hash", requestHash)
        .eq("result_status", "completed")
        .select("session_id")
        .maybeSingle();
      if (relinkError || relinked?.session_id !== runId) return { ok: false as const };

      if (aggregate.complete) {
        const runCompletedAt = finalAttempt!.completedAt!;
        const { data: completedRun, error: runCompletionError } = await adminClient
          .from("study_runs")
          .update({
            result_status: "completed",
            session_id: runId,
            completed_at: runCompletedAt,
            updated_at: runCompletedAt,
          })
          .eq("id", runId)
          .eq("user_id", userId)
          .eq("artifact_id", artifact.id)
          .eq("result_status", "processing")
          .eq("final_segment_index", aggregate.finalSegmentIndex!)
          .select(STUDY_RUN_SELECT)
          .maybeSingle();
        if (runCompletionError) return { ok: false as const };
        if (!completedRun) {
          const { data: existingRun, error: existingRunError } = await adminClient
            .from("study_runs")
            .select(STUDY_RUN_SELECT)
            .eq("id", runId)
            .maybeSingle();
          if (existingRunError
              || existingRun?.user_id !== userId
              || existingRun?.artifact_id !== artifact.id
              || existingRun?.result_status !== "completed"
              || existingRun?.session_id !== runId
              || existingRun?.final_segment_index !== aggregate.finalSegmentIndex
              || existingRun?.completed_at !== runCompletedAt) {
            return { ok: false as const };
          }
        }

        if (artifact.topic && (realClassId || clientClassId)) {
          await adminClient.from("topic_signals").upsert({
            user_id: userId,
            class_id: (realClassId ?? clientClassId) as string,
            topic_id: artifact.topic,
            topic_name: artifact.topic,
            accuracy: evidenceSummary.score,
            incorrect_count: Math.max(0, evidenceSummary.total - evidenceSummary.correct),
            time_spent_minutes: Math.max(1, Math.round(aggregate.durationSeconds / 60)),
            source_type: "study-session",
            source_id: runId,
          }, {
            onConflict: "user_id,source_type,source_id",
            ignoreDuplicates: true,
          }).then(() => {}, () => {});
        }

        const masteryDeltas = (rawEvidenceRows ?? [])
          .map((row) => (
            typeof row.previous_strength === "number" && typeof row.resulting_strength === "number"
              ? row.resulting_strength - row.previous_strength
              : null
          ))
          .filter((value): value is number => typeof value === "number");
        const averageDelta = masteryDeltas.length
          ? masteryDeltas.reduce((sum, value) => sum + value, 0) / masteryDeltas.length
          : null;
        const snapshot = isRecord(artifact.study_scope_snapshot) ? artifact.study_scope_snapshot : {};
        const strategyOutcome = executedStrategyOutcomeMetadata(snapshot);
        const subjectProfile = isRecord(snapshot.subjectProfile) ? snapshot.subjectProfile : {};
        const { error: strategyOutcomeError } = await adminClient
          .from("study_strategy_outcomes")
          .upsert({
            user_id: userId,
            client_attempt_id: finalAttempt!.clientAttemptId,
            class_id: realClassId,
            artifact_id: artifact.id,
            subject_profile: typeof subjectProfile.id === "string" ? subjectProfile.id : "general",
            task_kind: strategyOutcome.taskKind,
            format: artifact.kind,
            strategy_id: strategyOutcome.strategyId,
            technique: strategyOutcome.technique,
            modality: strategyOutcome.modality,
            outcome_source: "study_result",
            correct: evidenceSummary.correct,
            total: evidenceSummary.total,
            mastery_delta: averageDelta === null ? null : Number(averageDelta.toFixed(4)),
            evidence_tier: evidenceTier,
            occurred_at: runCompletedAt,
          }, {
            onConflict: "user_id,client_attempt_id",
            ignoreDuplicates: true,
          });
        if (strategyOutcomeError) return { ok: false as const };
      }

      return { ok: true as const, payload: canonicalPayload };
    }

    let sessionId = completed.session_id;
    let existingSession: {
      id: string;
      user_id: string;
      artifact_id: string | null;
      client_attempt_id: string | null;
      result_request_hash: string | null;
    } | null = null;
    if (sessionId) {
      const { data, error } = await adminClient
        .from("study_sessions")
        .select("id, user_id, artifact_id, client_attempt_id, result_request_hash")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) return { ok: false as const };
      existingSession = data;
      if (existingSession && (
        existingSession.user_id !== userId
        || existingSession.artifact_id !== artifact.id
        || existingSession.client_attempt_id !== attemptId
        || existingSession.result_request_hash !== requestHash
      )) return { ok: false as const };
    }
    if (!existingSession) sessionId = crypto.randomUUID();

    let canonicalPayload = {
      ...completed.result_payload,
      sessionId,
    };
    const canonicalHistory = {
      user_id: userId,
      artifact_id: artifact.id,
      client_attempt_id: attemptId,
      result_request_hash: requestHash,
      result_status: "completed",
      result_payload: canonicalPayload,
      class_id: realClassId,
      client_class_id: clientClassId,
      mode: `artifact:${artifact.kind}`,
      duration_minutes: Math.max(1, Math.round(completed.duration_seconds / 60)),
      score: scorePct,
      topic: artifact.topic ?? null,
      study_scope_type: artifact.study_scope_type ?? "class",
      study_scope_id: artifact.study_scope_id ?? "class",
      study_scope_label: artifact.study_scope_label ?? null,
      study_scope_snapshot: artifact.study_scope_snapshot ?? {},
      ended_at: completed.completed_at,
    };

    if (existingSession) {
      const { data: repaired, error } = await adminClient
        .from("study_sessions")
        .update(canonicalHistory)
        .eq("id", sessionId!)
        .eq("user_id", userId)
        .eq("artifact_id", artifact.id)
        .eq("client_attempt_id", attemptId)
        .eq("result_request_hash", requestHash)
        .select("id")
        .maybeSingle();
      if (error || !repaired) return { ok: false as const };
    } else {
      const { data: recreated, error } = await adminClient
        .from("study_sessions")
        .insert({ id: sessionId!, ...canonicalHistory })
        .select("id")
        .maybeSingle();
      if (error?.code === "23505") {
        const { data: orphan, error: orphanError } = await adminClient
          .from("study_sessions")
          .select("id")
          .eq("user_id", userId)
          .eq("artifact_id", artifact.id)
          .eq("client_attempt_id", attemptId)
          .eq("result_request_hash", requestHash)
          .maybeSingle();
        if (orphanError || !orphan) return { ok: false as const };
        sessionId = orphan.id;
        canonicalPayload = { ...completed.result_payload, sessionId };
        const { data: repairedOrphan, error: orphanRepairError } = await adminClient
          .from("study_sessions")
          .update({ ...canonicalHistory, result_payload: canonicalPayload })
          .eq("id", sessionId)
          .eq("user_id", userId)
          .eq("artifact_id", artifact.id)
          .eq("client_attempt_id", attemptId)
          .eq("result_request_hash", requestHash)
          .select("id")
          .maybeSingle();
        if (orphanRepairError || !repairedOrphan) return { ok: false as const };
      } else if (error || !recreated) return { ok: false as const };
    }

    const { data: relinked, error: relinkError } = await adminClient
      .from("study_result_attempts")
      .update({
        session_id: sessionId,
        result_payload: canonicalPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", "completed")
      .select("session_id")
      .maybeSingle();
    if (relinkError || relinked?.session_id !== sessionId) return { ok: false as const };
    return { ok: true as const, payload: canonicalPayload };
  };

  // Freshness is a gate for new evidence only. An exact retry may arrive after
  // regeneration or a deploy marks its artifact stale; its authoritative
  // ledger attempt must still be returned or resumed idempotently.
  if (!priorAttempt && (
    artifact.stale
    || artifact.prompt_version !== CURRENT_ARTIFACT_PROMPT_VERSION
  )) {
    return json({
      error: "This study set must be refreshed before results can be saved",
      ...(artifact.kind === "practice" ? {
        reason: "practice_artifact_stale",
        retryable: false,
      } : {}),
    }, 409);
  }
  if (!priorAttempt && artifact.kind === "practice") {
    const payload = artifact.payload;
    const practiceProblem = isRecord(payload) && Array.isArray(payload.problems)
      ? payload.problems[0]
      : null;
    if (!isRecord(practiceProblem)
        || practiceProblem.conceptName !== concepts[0]?.name) {
      return json({
        error: "practice concept does not match its assignment capture",
        reason: "practice_source_changed",
        retryable: false,
      }, 409);
    }
    const boundary = await verifyPracticeArtifactBoundary(supabase, userId, artifact);
    if (boundary instanceof Response) return boundary;
  }

  let groupedRun: StudyRunRow | null = null;
  if (studyRunContract.kind === "grouped") {
    const loadStudyRun = async () => {
      const { data, error } = await adminClient
        .from("study_runs")
        .select(STUDY_RUN_SELECT)
        .eq("id", studyRunContract.studyRunId)
        .maybeSingle();
      return { run: data as StudyRunRow | null, error };
    };
    let loaded = await loadStudyRun();
    if (loaded.error) return json({ error: "study run lookup failed" }, 500);
    if (!loaded.run && !priorAttempt) {
      const { data, error } = await adminClient
        .from("study_runs")
        .insert({
          id: studyRunContract.studyRunId,
          user_id: userId,
          artifact_id: artifact.id,
          evidence_contract_version: EVIDENCE_CONTRACT_VERSION,
          result_status: "processing",
        })
        .select(STUDY_RUN_SELECT)
        .maybeSingle();
      if (error?.code === "23505") {
        loaded = await loadStudyRun();
        if (loaded.error) return json({ error: "study run lookup failed" }, 500);
      } else if (error) {
        return json({ error: "study run reservation failed", retryable: true }, 500);
      } else {
        loaded = { run: data as StudyRunRow | null, error: null };
      }
    }
    groupedRun = loaded.run;
    if (!groupedRun
        || groupedRun.user_id !== userId
        || groupedRun.artifact_id !== artifact.id
        || groupedRun.evidence_contract_version !== EVIDENCE_CONTRACT_VERSION) {
      return json({ error: "studyRunId already belongs to a different study run" }, 409);
    }
    if (!priorAttempt && (
      groupedRun.result_status === "completed"
      || groupedRun.final_segment_index !== null
    )) {
      return json({ error: "study run is already final" }, 409);
    }
    if (!priorAttempt) {
      const { data: priorSegments, error: priorSegmentsError } = await adminClient
        .from("study_result_attempts")
        .select("client_attempt_id")
        .eq("study_run_id", studyRunContract.studyRunId)
        .eq("user_id", userId)
        .eq("artifact_id", artifact.id);
      if (priorSegmentsError) return json({ error: "study run evidence lookup failed" }, 500);
      const priorAttemptIds = (priorSegments ?? []).map((row) => row.client_attempt_id);
      let priorConceptIds: string[] = [];
      if (priorAttemptIds.length) {
        const { data: priorEvidence, error: priorEvidenceError } = await adminClient
          .from("study_result_concept_updates")
          .select("concept_id")
          .eq("user_id", userId)
          .in("client_attempt_id", priorAttemptIds);
        if (priorEvidenceError) {
          return json({ error: "study run evidence lookup failed" }, 500);
        }
        priorConceptIds = (priorEvidence ?? []).map((row) => row.concept_id);
      }
      const priorConceptSet = new Set(priorConceptIds);
      if (scoredConceptIds.some((conceptId) => priorConceptSet.has(conceptId))) {
        return json({
          error: "study run already contains evidence for this concept",
          reason: "study_run_coverage_conflict",
          retryable: false,
        }, 409);
      }
      const coveredConcepts = new Set([...priorConceptIds, ...scoredConceptIds]);
      const exactArtifactCoverage = coveredConcepts.size === conceptIds.length
        && conceptIds.every((conceptId) => coveredConcepts.has(conceptId));
      if (studyRunContract.segmentFinal !== exactArtifactCoverage) {
        return json({
          error: studyRunContract.segmentFinal
            ? "final study segment must cover every artifact concept exactly once"
            : "complete artifact coverage must be marked as the final study segment",
          reason: "study_run_coverage_conflict",
          retryable: false,
        }, 409);
      }
    }
  }

  let attempt: StudyResultAttemptRow | null = null;
  let practiceMasteryReservation: PracticeMasteryReservation | null = null;
  const reservePracticeMastery = () => adminClient.rpc(
    evidenceContractVersion === EVIDENCE_CONTRACT_VERSION
      ? "reserve_practice_study_attempt_v2"
      : "reserve_practice_study_attempt",
    {
      p_user_id: userId,
      p_client_attempt_id: attemptId,
      p_artifact_id: artifact.id,
      p_challenge_fingerprint: practiceChallengeFingerprint!,
      p_result_request_hash: requestHash,
      p_client_request_hash: practiceClientRequestHash!,
      p_verified_grading_snapshot: verifiedPracticeSnapshot!,
      p_lease_token: leaseToken,
      p_lease_started_at: claimedAt,
      p_duration_seconds: Math.trunc(body.durationSeconds),
    },
  );
  if (priorAttempt) {
    if (priorAttempt.artifact_id !== body.artifactId
        || priorAttempt.result_request_hash !== requestHash
        || (artifact.kind === "practice"
          && priorAttempt.challenge_fingerprint !== practiceChallengeFingerprint)) {
      return json({ error: "attemptId already belongs to a different study result" }, 409);
    }
    const disposition = studyAttemptDisposition(
      priorAttempt.result_status,
      priorAttempt.lease_started_at,
    );
    if (disposition === "return-cached") {
      const repaired = await repairCompletedSession(priorAttempt);
      if (!repaired.ok) {
        return json({ error: "study history repair failed", retryable: true }, 500);
      }
      if (evidenceContractVersion === EVIDENCE_CONTRACT_VERSION
          && (realClassId || clientClassId)) {
        // Re-entering the atomic projector is safe: it preserves the frozen
        // per-attempt row while repairing a missing history projection and the
        // current full-class cache. Completed retries never overwrite an exam
        // cache from an older artifact denominator.
        const { error: readinessRepairError } = await adminClient.rpc(
          "project_study_readiness_v1",
          {
            p_user_id: userId,
            p_client_attempt_id: attemptId,
            p_artifact_id: artifact.id,
            p_result_request_hash: requestHash,
            p_lease_token: priorAttempt.lease_token,
            p_scored_concept_ids: scoredConceptIds,
          },
        );
        if (readinessRepairError) {
          return json({ error: "study readiness repair failed", retryable: true }, 500);
        }
      }
      return json(repaired.payload);
    }
    if (disposition === "wait") {
      return json({ error: "study result is still saving", retryable: true }, 409);
    }
    const { data: reclaimed, error: reclaimError } = await adminClient
      .from("study_result_attempts")
      .update({
        result_status: "processing",
        result_payload: null,
        completed_at: null,
        lease_token: leaseToken,
        lease_started_at: claimedAt,
        updated_at: claimedAt,
      })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", priorAttempt.result_status)
      .eq("lease_token", priorAttempt.lease_token)
      .eq("lease_started_at", priorAttempt.lease_started_at)
      .select(ATTEMPT_SELECT)
      .maybeSingle();
    if (reclaimError) return json({ error: "attempt reclaim failed" }, 500);
    if (!reclaimed) {
      return json({ error: "study result is already being retried", retryable: true }, 409);
    }
    attempt = reclaimed as StudyResultAttemptRow;
  } else {
    if (artifact.kind === "practice") {
      if (!practiceChallengeFingerprint || !practiceClientRequestHash
          || !verifiedPracticeSnapshot) {
        return json({ error: "practice challenge is invalid" }, 409);
      }
      const { data: reservationData, error: reservationError } = await reservePracticeMastery();
      if (reservationError) {
        return json({ error: "practice result could not be reserved", retryable: true }, 500);
      }
      const reservation = isRecord(reservationData) ? reservationData : null;
      if (!reservation || typeof reservation.disposition !== "string") {
        return json({ error: "practice reservation was not confirmed", retryable: true }, 500);
      }
      if (reservation.disposition === "attempt-exists") {
        return json({ error: "study result is already being saved", retryable: true }, 409);
      }
      if (reservation.disposition === "challenge-conflict") {
        const ownerAttemptId = typeof reservation.ownerAttemptId === "string"
          ? reservation.ownerAttemptId
          : null;
        return practiceChallengeConflictResponse(adminClient, userId, ownerAttemptId);
      }
      if (reservation.disposition === "boundary-conflict") {
        return practiceBoundaryConflict("practice source changed before this result could be recorded");
      }
      if (reservation.disposition === "attempt-mismatch") {
        return json({ error: "attemptId already belongs to a different study result" }, 409);
      }
      if (reservation.disposition !== "reserved") {
        return json({ error: "practice reservation was not confirmed", retryable: true }, 500);
      }
      practiceMasteryReservation = parsePracticeMasteryReservation(reservation);
      attempt = {
        artifact_id: artifact.id,
        challenge_fingerprint: practiceChallengeFingerprint,
        client_request_hash: practiceClientRequestHash,
        verified_grading_snapshot: verifiedPracticeSnapshot,
        result_status: "processing",
        result_payload: null,
        result_request_hash: requestHash,
        lease_token: leaseToken,
        lease_started_at: claimedAt,
        duration_seconds: Math.trunc(body.durationSeconds),
        session_id: null,
        completed_at: null,
        evidence_contract_version: EVIDENCE_CONTRACT_VERSION,
        evidence_tier: evidenceTier,
        target_task_kind: targetTaskKind,
        readiness_projection: null,
        study_run_id: null,
        study_run_segment: null,
        study_run_final: null,
        study_run_correct: null,
        study_run_total: null,
        study_run_concept_ids: null,
      };
    } else {
      const { data: insertedAttempt, error: attemptInsertError } = await adminClient
        .from("study_result_attempts")
        .insert({
          user_id: userId,
          client_attempt_id: attemptId,
          artifact_id: artifact.id,
          challenge_fingerprint: null,
          client_request_hash: null,
          verified_grading_snapshot: null,
          result_request_hash: requestHash,
          result_status: "processing",
          lease_token: leaseToken,
          lease_started_at: claimedAt,
          duration_seconds: Math.trunc(body.durationSeconds),
          evidence_contract_version: EVIDENCE_CONTRACT_VERSION,
          evidence_tier: evidenceTier,
          target_task_kind: targetTaskKind,
          ...(studyRunContract.kind === "grouped"
            ? {
                study_run_id: studyRunContract.studyRunId,
                study_run_segment: studyRunContract.segmentIndex,
                study_run_final: studyRunContract.segmentFinal,
                study_run_correct: correct,
                study_run_total: total,
                study_run_concept_ids: [...scoredConceptIds].sort(),
              }
            : {}),
        })
        .select(ATTEMPT_SELECT)
        .single();
      if (attemptInsertError) {
        if (studyRunContract.kind === "grouped"
            && isStudyRunCoverageError(attemptInsertError)) {
          return json({
            error: "study run coverage is invalid; start a new study run",
            reason: "study_run_coverage_conflict",
            retryable: false,
          }, 409);
        }
        if (attemptInsertError.code === "23505") {
          return json({ error: "study result is already being saved", retryable: true }, 409);
        }
        return json({ error: "attempt reservation failed" }, 500);
      }
      attempt = insertedAttempt as StudyResultAttemptRow;
    }
  }

  // A reclaimed first attempt may predate the atomic reservation response or
  // have lost its HTTP response. Re-enter the same database function: it
  // returns the committed mastery marker, or validates and applies the frozen
  // first response under the capture/source locks.
  if (artifact.kind === "practice" && priorAttempt && attempt) {
    if (!practiceChallengeFingerprint || !practiceClientRequestHash || !verifiedPracticeSnapshot) {
      return json({ error: "practice challenge is invalid" }, 409);
    }
    const { data: reservationData, error: reservationError } = await reservePracticeMastery();
    if (reservationError) {
      return json({ error: "practice result could not be recovered", retryable: true }, 500);
    }
    const reservation = isRecord(reservationData) ? reservationData : null;
    if (!reservation || typeof reservation.disposition !== "string") {
      return json({ error: "practice recovery was not confirmed", retryable: true }, 500);
    }
    if (reservation.disposition === "boundary-conflict") {
      return practiceBoundaryConflict("practice source changed before this result could be recovered");
    }
    if (reservation.disposition === "attempt-mismatch") {
      return json({ error: "attemptId already belongs to a different study result" }, 409);
    }
    if (reservation.disposition === "challenge-conflict") {
      const ownerAttemptId = typeof reservation.ownerAttemptId === "string"
        ? reservation.ownerAttemptId
        : null;
      return practiceChallengeConflictResponse(adminClient, userId, ownerAttemptId);
    }
    if (reservation.disposition !== "attempt-exists"
        && reservation.disposition !== "reserved") {
      return json({ error: "practice recovery was not confirmed", retryable: true }, 500);
    }
    practiceMasteryReservation = parsePracticeMasteryReservation(reservation);
  }
  if (!attempt) return json({ error: "attempt reservation failed" }, 500);

  // The first accepted request owns this segment's timing. Grouped attempts
  // carry deltas; the shared history row aggregates them exactly once.
  const attemptDurationMinutes = Math.max(1, Math.round(attempt.duration_seconds / 60));

  // study_sessions is presentation/history only. Service-role writes plus the
  // database guard keep artifact rows immutable to browser clients. Grouped
  // attempts share one deterministic session id for the whole logical run.
  let session: { id: string } | null = null;
  if (attempt.session_id) {
    const { data: linkedSession, error: linkedSessionError } = await adminClient
      .from("study_sessions")
      .select("id, user_id, artifact_id, client_attempt_id, result_request_hash, study_run_id")
      .eq("id", attempt.session_id)
      .maybeSingle();
    if (linkedSessionError) {
      return json({ error: "session lookup failed" }, 500);
    }
    if (!linkedSession
        || linkedSession.user_id !== userId
        || linkedSession.artifact_id !== artifact.id
        || (studyRunContract.kind === "grouped"
          ? linkedSession.id !== studyRunContract.studyRunId
            || linkedSession.client_attempt_id !== studyRunContract.studyRunId
            || linkedSession.study_run_id !== studyRunContract.studyRunId
            || linkedSession.result_request_hash !== null
          : linkedSession.client_attempt_id !== attemptId
            || linkedSession.result_request_hash !== requestHash
            || linkedSession.study_run_id !== null)) {
      return json({ error: "attempt history link is invalid" }, 500);
    }
    session = linkedSession;
  } else {
    const sessionValues = {
      user_id: userId,
      artifact_id: artifact.id,
      client_attempt_id: studyRunContract.kind === "grouped"
        ? studyRunContract.studyRunId
        : attemptId,
      result_request_hash: studyRunContract.kind === "grouped" ? null : requestHash,
      study_run_id: studyRunContract.kind === "grouped"
        ? studyRunContract.studyRunId
        : null,
      result_status: "processing",
      result_payload: null,
      class_id: realClassId,
      client_class_id: clientClassId,
      mode: `artifact:${artifact.kind}`,
      duration_minutes: attemptDurationMinutes,
      score: scorePct,
      topic: artifact.topic ?? null,
      study_scope_type: artifact.study_scope_type ?? "class",
      study_scope_id: artifact.study_scope_id ?? "class",
      study_scope_label: artifact.study_scope_label ?? null,
      study_scope_snapshot: artifact.study_scope_snapshot ?? {},
      ended_at: null,
    };
    const { data: insertedSession, error: sessionInsertError } = await adminClient
      .from("study_sessions")
      .insert({
        ...(studyRunContract.kind === "grouped" ? { id: studyRunContract.studyRunId } : {}),
        ...sessionValues,
      })
      .select("id")
      .maybeSingle();
    if (sessionInsertError?.code === "23505") {
      const recoveredQuery = adminClient
        .from("study_sessions")
        .select("id, user_id, artifact_id, client_attempt_id, result_request_hash, study_run_id");
      const { data: recoveredSession, error: recoveredSessionError } = studyRunContract.kind === "grouped"
        ? await recoveredQuery.eq("id", studyRunContract.studyRunId).maybeSingle()
        : await recoveredQuery
          .eq("user_id", userId)
          .eq("client_attempt_id", attemptId)
          .eq("artifact_id", artifact.id)
          .eq("result_request_hash", requestHash)
          .maybeSingle();
      if (recoveredSessionError) {
        return json({ error: "session recovery failed" }, 500);
      }
      if (!recoveredSession
          || recoveredSession.user_id !== userId
          || recoveredSession.artifact_id !== artifact.id
          || (studyRunContract.kind === "grouped"
            ? recoveredSession.client_attempt_id !== studyRunContract.studyRunId
              || recoveredSession.study_run_id !== studyRunContract.studyRunId
              || recoveredSession.result_request_hash !== null
            : recoveredSession.client_attempt_id !== attemptId
              || recoveredSession.result_request_hash !== requestHash
              || recoveredSession.study_run_id !== null)) {
        return json({ error: "session recovery conflict" }, 409);
      }
      session = { id: recoveredSession.id };
    } else if (sessionInsertError) {
      return json({ error: "session insert failed" }, 500);
    } else {
      session = insertedSession;
    }
    if (!session) return json({ error: "session history could not be reserved" }, 409);

    const { data: linkedAttempt, error: linkError } = await adminClient
      .from("study_result_attempts")
      .update({ session_id: session.id, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", "processing")
      .eq("lease_token", attempt.lease_token)
      .select("session_id")
      .maybeSingle();
    if (linkError) return json({ error: "attempt history link failed" }, 500);
    if (!linkedAttempt) {
      return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
    }
    attempt.session_id = session.id;
  }
  if (studyRunContract.kind === "grouped" && groupedRun?.session_id !== session.id) {
    const { data: linkedRun, error: runLinkError } = await adminClient
      .from("study_runs")
      .update({ session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", studyRunContract.studyRunId)
      .eq("user_id", userId)
      .eq("artifact_id", artifact.id)
      .select("session_id")
      .maybeSingle();
    if (runLinkError || linkedRun?.session_id !== session.id) {
      return json({ error: "study run history link failed", retryable: true }, 500);
    }
    groupedRun!.session_id = session.id;
  }

  // 4. Update user_concept_mastery per concept.
  // Per-concept results if provided; otherwise apply overall pass/fail to each.
  const now = new Date();
  const previousStrengthByConcept = new Map<string, number>();
  const resultingStrengthByConcept = new Map<string, number>();
  let appliedAny = false;
  if (artifact.kind === "practice") {
    if (!practiceMasteryReservation) {
      return json({ error: "practice mastery reservation is missing", retryable: true }, 500);
    }
    appliedAny = practiceMasteryReservation.applied;
    previousStrengthByConcept.set(conceptIds[0], practiceMasteryReservation.previousStrength);
    resultingStrengthByConcept.set(conceptIds[0], practiceMasteryReservation.resultingStrength);
  } else for (const conceptId of scoredConceptIds) {
    const { data: applied, error: applyErr } = await adminClient.rpc(
      evidenceContractVersion === EVIDENCE_CONTRACT_VERSION
        ? "apply_study_concept_result_v3"
        : "apply_study_concept_result_v2",
      {
        p_user_id: userId,
        p_attempt_id: attemptId,
        p_concept_id: conceptId,
        p_class_id: realClassId,
        p_correct: perMap.get(conceptId)?.correct ?? false,
        p_confidence: perMap.get(conceptId)?.confidence ?? "medium",
        p_recovered: perMap.get(conceptId)?.recovered ?? false,
        p_seen_at: now.toISOString(),
      },
    );
    if (applyErr) {
      await adminClient
        .from("study_result_attempts")
        .update({ result_status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("client_attempt_id", attemptId)
        .eq("artifact_id", artifact.id)
        .eq("result_request_hash", requestHash)
        .eq("result_status", "processing")
        .eq("lease_token", attempt.lease_token);
      if (studyRunContract.kind === "grouped" && isStudyRunCoverageError(applyErr)) {
        return json({
          error: "study run coverage is invalid; start a new study run",
          reason: "study_run_coverage_conflict",
          retryable: false,
        }, 409);
      }
      return json({ error: "mastery update failed" }, 500);
    }
    const result = applied as {
      applied?: boolean;
      previousStrength?: number | null;
      resultingStrength?: number | null;
    } | null;
    appliedAny = appliedAny || result?.applied === true;
    previousStrengthByConcept.set(conceptId, Number(result?.previousStrength) || 0);
    resultingStrengthByConcept.set(
      conceptId,
      Number(result?.resultingStrength ?? result?.previousStrength) || 0,
    );
  }

  // A reclaimed request may be repairing the projections after mastery was
  // already committed. Per-attempt unique keys below make replay safe.
  const shouldWriteDerivedEvidence = appliedAny || Boolean(priorAttempt);

  // Renew by lease token after the mastery loop. This compare-and-swap both
  // proves ownership and gives the short derived-write section a fresh window,
  // so a stale worker cannot race a legitimate mobile retry.
  const renewedAt = new Date().toISOString();
  const { data: activeLease, error: leaseError } = await adminClient
    .from("study_result_attempts")
    .update({ lease_started_at: renewedAt, updated_at: renewedAt })
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .eq("artifact_id", artifact.id)
    .eq("result_status", "processing")
    .eq("result_request_hash", requestHash)
    .eq("lease_token", attempt.lease_token)
    .select("lease_token, lease_started_at")
    .maybeSingle();
  if (leaseError) return json({ error: "study result lease check failed", retryable: true }, 500);
  if (!activeLease) {
    return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
  }

  const markActiveAttemptFailed = async () => {
    await adminClient
      .from("study_result_attempts")
      .update({ result_status: "failed", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .eq("artifact_id", artifact.id)
      .eq("result_request_hash", requestHash)
      .eq("result_status", "processing")
      .eq("lease_token", attempt.lease_token);
  };

  const derivedWriteFailure = async (message: string) => {
    // Mastery is already idempotently committed. Marking the projection phase
    // failed lets the exact same outbox request reclaim immediately and repair
    // readiness/strategy rows without waiting for the active lease to expire.
    await markActiveAttemptFailed();
    return json({ error: message, retryable: true }, 500);
  };

  // 5. Project full-scope readiness in one service-only database transaction.
  // The RPC owns the denominator, class/exam locks, missing-as-zero math,
  // frozen attempt history and current caches. Keeping those steps together
  // prevents a slower concurrent worker from publishing an older calculation.
  let readiness: number | null = null;
  let readinessBefore: number | null = null;
  if (realClassId || clientClassId) {
    if (!shouldWriteDerivedEvidence) {
      return await derivedWriteFailure("readiness evidence was not committed");
    }
    const { data: projected, error: projectionError } = await adminClient.rpc(
      "project_study_readiness_v1",
      {
        p_user_id: userId,
        p_client_attempt_id: attemptId,
        p_artifact_id: artifact.id,
        p_result_request_hash: requestHash,
        p_lease_token: attempt.lease_token,
        p_scored_concept_ids: scoredConceptIds,
      },
    );
    if (projectionError) {
      return await derivedWriteFailure("readiness projection failed");
    }
    if (evidenceContractVersion === EVIDENCE_CONTRACT_VERSION) {
      const parsedProjection = parseReadinessProjection(projected);
      if (!parsedProjection) {
        return await derivedWriteFailure("readiness projection was invalid");
      }
      readiness = parsedProjection.readiness;
      readinessBefore = parsedProjection.readinessBefore;
    } else {
      const legacyProjection = parseLegacyReadinessProjection(projected);
      if (!legacyProjection) {
        return await derivedWriteFailure("legacy readiness repair was invalid");
      }
      readiness = legacyProjection.readiness;
      readinessBefore = legacyProjection.readinessBefore;
    }
  }

  // 6. Optional topic_signal (best-effort, non-fatal).
  if (studyRunContract.kind !== "grouped"
      && shouldWriteDerivedEvidence
      && artifact.topic
      && (realClassId || clientClassId)) {
    await adminClient.from("topic_signals").upsert({
      user_id: userId,
      class_id: (realClassId ?? clientClassId) as string,
      topic_id: artifact.topic,
      topic_name: artifact.topic,
      accuracy: scorePct,
      incorrect_count: Math.max(0, total - correct),
      time_spent_minutes: attemptDurationMinutes,
      source_type: "study-session",
      source_id: session.id,
    }, {
      onConflict: "user_id,source_type,source_id",
      ignoreDuplicates: true,
    }).then(() => {}, () => {});
  }

  // 7. Strategy-effectiveness evidence is part of the durable learning loop.
  // Only ranking metadata is stored — never question text, answers, concept
  // content, or source excerpts. Owner-scoped; no cross-student aggregation.
  if (studyRunContract.kind !== "grouped" && shouldWriteDerivedEvidence) {
    const snapshot = isRecord(artifact.study_scope_snapshot) ? artifact.study_scope_snapshot : {};
    const strategyOutcome = executedStrategyOutcomeMetadata(snapshot);
    const subjectProfile = isRecord(snapshot.subjectProfile) ? snapshot.subjectProfile : {};
    const masteryDeltas = scoredConceptIds
      .map((conceptId) => {
        const previous = previousStrengthByConcept.get(conceptId);
        const resulting = resultingStrengthByConcept.get(conceptId);
        return typeof previous === "number" && typeof resulting === "number"
          ? resulting - previous
          : null;
      })
      .filter((value): value is number => typeof value === "number");
    const averageDelta = masteryDeltas.length
      ? masteryDeltas.reduce((a, b) => a + b, 0) / masteryDeltas.length
      : null;
    const { error: strategyOutcomeError } = await adminClient.from("study_strategy_outcomes").upsert({
      user_id: userId,
      client_attempt_id: attemptId,
      class_id: realClassId,
      artifact_id: artifact.id,
      subject_profile: typeof subjectProfile.id === "string" ? subjectProfile.id : "general",
      task_kind: strategyOutcome.taskKind,
      format: artifact.kind,
      strategy_id: strategyOutcome.strategyId,
      technique: strategyOutcome.technique,
      modality: strategyOutcome.modality,
      outcome_source: "study_result",
      correct,
      total,
      mastery_delta: averageDelta === null
        ? null
        : Number(averageDelta.toFixed(4)),
      evidence_tier: evidenceContractVersion === EVIDENCE_CONTRACT_VERSION
        ? evidenceTier
        : null,
      occurred_at: now.toISOString(),
    }, {
      onConflict: "user_id,client_attempt_id",
      ignoreDuplicates: true,
    });
    if (strategyOutcomeError) {
      return await derivedWriteFailure("strategy evidence update failed");
    }
  }

  const resultPayload = {
    ok: true,
    sessionId: session.id,
    readiness,
    readinessBefore,
    readinessDelta: readiness !== null && readinessBefore !== null
      ? readiness - readinessBefore
      : null,
    updatedConcepts: scoredConceptIds.length,
    recoveredConcepts: [...perMap.values()].filter((result) => result.recovered).length,
  };

  // Complete the service-only ledger first. If this update or the HTTP response
  // is lost, the attempt row still returns the exact cached response and repairs
  // presentation history without applying mastery twice.
  const endedAt = new Date().toISOString();
  const { data: completedAttempt, error: completionError } = await adminClient
    .from("study_result_attempts")
    .update({
      result_status: "completed",
      result_payload: resultPayload,
      completed_at: endedAt,
      updated_at: endedAt,
    })
    .eq("user_id", userId)
    .eq("client_attempt_id", attemptId)
    .eq("artifact_id", artifact.id)
    .eq("result_status", "processing")
    .eq("result_request_hash", requestHash)
    .eq("lease_token", attempt.lease_token)
    .select("result_status, result_payload, completed_at, session_id, duration_seconds")
    .maybeSingle();

  if (completionError) {
    return json({ error: "study result completion failed", retryable: true }, 500);
  }
  if (!completedAttempt
      || completedAttempt.result_status !== "completed"
      || !completedAttempt.completed_at) {
    const { data: currentAttempt } = await adminClient
      .from("study_result_attempts")
      .select("result_status, result_payload, completed_at, session_id, duration_seconds")
      .eq("user_id", userId)
      .eq("client_attempt_id", attemptId)
      .maybeSingle();
    if (currentAttempt?.result_status === "completed" && currentAttempt.completed_at) {
      const repaired = await repairCompletedSession(currentAttempt);
      if (!repaired.ok) {
        return json({ error: "study history repair failed", retryable: true }, 500);
      }
      return json(repaired.payload);
    }
    return json({ error: "study result was superseded; retry safely", retryable: true }, 409);
  }

  const repaired = await repairCompletedSession(completedAttempt);
  if (!repaired.ok) {
    return json({ error: "study history completion failed", retryable: true }, 500);
  }

  return json(repaired.payload);
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactItemConceptIds(kind: string, payload: unknown): string[] | null {
  if (!isRecord(payload)) return null;
  const rootKey = kind === "flashcards"
    ? "cards"
    : kind === "multiple_choice"
      ? "questions"
      : kind === "matching"
        ? "pairs"
        : kind === "practice"
          ? "problems"
          : null;
  if (!rootKey || !Array.isArray(payload[rootKey])) return null;
  const ids: string[] = [];
  for (const rawItem of payload[rootKey]) {
    if (!isRecord(rawItem) || typeof rawItem.conceptId !== "string"
        || !UUID_PATTERN.test(rawItem.conceptId) || ids.includes(rawItem.conceptId)) {
      return null;
    }
    ids.push(rawItem.conceptId);
  }
  return ids;
}

function canonicalPracticeTransfer(artifact: Record<string, unknown>): {
  answerIndex: number;
  choiceCount: number;
  challengeMaterial: string;
} | null {
  const payload = artifact.payload;
  if (!isRecord(payload) || !Array.isArray(payload.problems) || payload.problems.length !== 1) {
    return null;
  }
  const problem = payload.problems[0];
  const snapshot = artifact.study_scope_snapshot;
  if (artifact.model !== "deterministic-assignment-tutor-v1"
      || typeof artifact.prompt_version !== "string"
      || !isRecord(problem)
      || typeof problem.conceptId !== "string"
      || !UUID_PATTERN.test(problem.conceptId)
      || typeof problem.conceptName !== "string"
      || typeof problem.sourceExcerpt !== "string"
      || typeof artifact.capture_id !== "string"
      || !UUID_PATTERN.test(artifact.capture_id)
      || !isRecord(snapshot)
      || typeof snapshot.assignmentId !== "string"
      || !UUID_PATTERN.test(snapshot.assignmentId)
      || snapshot.intent !== "assignment-help") {
    return null;
  }
  const canonical = buildAssignmentTutorPractice({
    conceptId: problem.conceptId,
    conceptName: problem.conceptName,
    sourceExcerpt: problem.sourceExcerpt,
  });
  if (!canonical.supported
      || canonicalJsonStringify(problem) !== canonicalJsonStringify(canonical.problem)) return null;
  const originalAnswer = canonical.problem.original.choices[canonical.problem.original.answerIndex];
  const transferAnswer = canonical.problem.transfer.choices[canonical.problem.transfer.answerIndex];
  return {
    answerIndex: canonical.problem.transfer.answerIndex,
    choiceCount: canonical.problem.transfer.choices.length,
    challengeMaterial: JSON.stringify({
      schemaVersion: "assignment-tutor-challenge-v1",
      assignmentId: snapshot.assignmentId,
      original: {
        prompt: canonical.problem.original.prompt,
        answer: originalAnswer,
      },
      transfer: {
        prompt: canonical.problem.transfer.prompt,
        answer: transferAnswer,
      },
    }),
  };
}

async function verifyPracticeArtifactBoundary(
  supabase: SupabaseClient,
  userId: string,
  artifact: Record<string, unknown>,
): Promise<true | Response> {
  const snapshot = artifact.study_scope_snapshot;
  if (!isRecord(snapshot)
      || typeof snapshot.assignmentId !== "string"
      || !UUID_PATTERN.test(snapshot.assignmentId)
      || !Number.isInteger(snapshot.practiceSourceVersion)
      || (snapshot.practiceSourceVersion as number) < 1
      || typeof snapshot.practiceSourceHash !== "string"
      || !/^[0-9a-f]{64}$/.test(snapshot.practiceSourceHash)
      || typeof snapshot.practiceConceptId !== "string"
      || !UUID_PATTERN.test(snapshot.practiceConceptId)
      || typeof artifact.capture_id !== "string"
      || !UUID_PATTERN.test(artifact.capture_id)) {
    return practiceBoundaryConflict("practice assignment scope is invalid");
  }

  const { data: captureData, error: captureError } = await supabase
    .from("captures")
    .select("id, assignment_id, class_id, client_class_id, kind, processing_status, concept_extraction_claim_id, practice_source_status, practice_source_text, practice_source_version, practice_source_hash, practice_concept_id")
    .eq("user_id", userId)
    .eq("id", artifact.capture_id)
    .maybeSingle();
  if (captureError) return json({ error: "practice capture could not be verified" }, 500);
  const capture = captureData as PracticeCaptureBoundaryRow | null;
  if (!capture) return practiceBoundaryConflict("practice capture is no longer available");

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, class_id, client_class_id")
    .eq("user_id", userId)
    .eq("id", snapshot.assignmentId)
    .is("source_archived_at", null)
    .maybeSingle();
  if (assignmentError) return json({ error: "practice assignment could not be verified" }, 500);
  const assignment = assignmentData as PracticeAssignmentBoundaryRow | null;
  if (!assignment) return practiceBoundaryConflict("practice assignment is no longer available");

  const payload = artifact.payload;
  const problem = isRecord(payload) && Array.isArray(payload.problems) ? payload.problems[0] : null;
  const sourceExcerpt = isRecord(problem) && typeof problem.sourceExcerpt === "string"
    ? problem.sourceExcerpt
    : null;
  const conceptId = isRecord(problem) && typeof problem.conceptId === "string"
    ? problem.conceptId
    : null;
  if (!conceptId || !UUID_PATTERN.test(conceptId)) {
    return practiceBoundaryConflict("practice concept provenance is invalid");
  }
  const { data: evidence, error: evidenceError } = await supabase
    .from("concept_capture_evidence")
    .select("concept_id")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .eq("capture_id", artifact.capture_id)
    .maybeSingle();
  if (evidenceError) return json({ error: "practice concept provenance could not be verified" }, 500);
  if (!evidence) return practiceBoundaryConflict("practice concept is not evidenced by this capture");
  const confirmedSourceHash = typeof capture.practice_source_text === "string"
    ? await sha256Hex(capture.practice_source_text)
    : null;
  if (capture.kind !== "scan-assignment"
      || capture.processing_status !== "ready"
      || capture.concept_extraction_claim_id !== null
      || capture.practice_source_status !== "confirmed"
      || capture.assignment_id !== assignment.id
      || capture.id !== artifact.capture_id
      || capture.class_id !== artifact.class_id
      || capture.client_class_id !== artifact.client_class_id
      || assignment.class_id !== artifact.class_id
      || assignment.client_class_id !== artifact.client_class_id
      || capture.practice_source_version !== snapshot.practiceSourceVersion
      || capture.practice_source_hash !== snapshot.practiceSourceHash
      || capture.practice_concept_id !== snapshot.practiceConceptId
      || conceptId !== capture.practice_concept_id
      || confirmedSourceHash !== capture.practice_source_hash
      || typeof capture.practice_source_text !== "string"
      || sourceExcerpt !== capture.practice_source_text) {
    return practiceBoundaryConflict("practice source no longer matches its assignment capture");
  }
  return true;
}

function practiceBoundaryConflict(error: string): Response {
  return json({
    error,
    reason: "practice_source_changed",
    retryable: false,
  }, 409);
}

async function practiceChallengeConflictResponse(
  adminClient: SupabaseClient,
  userId: string,
  ownerAttemptId: string | null,
): Promise<Response> {
  if (!ownerAttemptId || !UUID_PATTERN.test(ownerAttemptId)) {
    return json({
      error: "This practice result could not be confirmed. Build a new check before trying again.",
      reason: "challenge_unavailable",
      retryable: false,
    }, 409);
  }
  const { data: appliedRows, error: appliedError } = await adminClient
    .from("study_result_concept_updates")
    .select("concept_id")
    .eq("user_id", userId)
    .eq("client_attempt_id", ownerAttemptId)
    .limit(1);
  if (appliedError) return json({ error: "practice challenge could not be verified" }, 500);
  if ((appliedRows ?? []).length > 0) {
    return json({
      ok: true,
      outcome: "already-recorded",
      alreadyRecorded: true,
      reason: "challenge_already_recorded",
    });
  }
  const { data: ownerData, error } = await adminClient
    .from("study_result_attempts")
    .select("result_status, lease_started_at")
    .eq("user_id", userId)
    .eq("client_attempt_id", ownerAttemptId)
    .maybeSingle();
  if (error) return json({ error: "practice challenge could not be verified" }, 500);
  const owner = ownerData as PracticeChallengeOwnerRow | null;
  if (owner?.result_status === "processing"
      && studyAttemptDisposition(owner.result_status, owner.lease_started_at) === "wait") {
    return json({
      error: "This practice result is already being recorded",
      reason: "challenge_saving",
      retryable: true,
    }, 409);
  }
  // This response deliberately contains no prior score/readiness payload. The
  // current screen may show local answer feedback, but must never present a
  // different attempt's mastery delta as if it were newly saved.
  if (owner?.result_status === "completed") {
    return json({
      ok: true,
      outcome: "already-recorded",
      alreadyRecorded: true,
      reason: "challenge_already_recorded",
    });
  }
  return json({
    error: "This practice result could not be confirmed. Build a new check before trying again.",
    reason: "challenge_unavailable",
    retryable: false,
  }, 409);
}

function parseVerifiedPracticeGradingSnapshot(
  value: unknown,
): VerifiedPracticeGradingSnapshot | null {
  if (!isRecord(value)
      || value.version !== 1
      || typeof value.conceptId !== "string"
      || !UUID_PATTERN.test(value.conceptId)
      || !Number.isInteger(value.answerIndex)
      || (value.answerIndex as number) < 0
      || !Number.isInteger(value.choiceCount)
      || (value.choiceCount as number) < 2
      || (value.answerIndex as number) >= (value.choiceCount as number)
      || !Number.isInteger(value.selectedIndex)
      || (value.selectedIndex as number) < 0
      || (value.selectedIndex as number) >= (value.choiceCount as number)
      || !isConfidenceLevel(value.confidence)
      || typeof value.correct !== "boolean"
      || value.correct !== (value.selectedIndex === value.answerIndex)
      || typeof value.challengeFingerprint !== "string"
      || !/^[0-9a-f]{64}$/.test(value.challengeFingerprint)
      || typeof value.resultRequestHash !== "string"
      || !/^[0-9a-f]{64}$/.test(value.resultRequestHash)) {
    return null;
  }
  return value as unknown as VerifiedPracticeGradingSnapshot;
}

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function attemptMatchesStudyRunContract(
  attempt: StudyResultAttemptRow,
  contract: (GroupedStudyRunSegment & { conceptIds: string[] }) | null,
  correct: number,
  total: number,
) {
  if (!contract) {
    return attempt.study_run_id === null
      && attempt.study_run_segment === null
      && attempt.study_run_final === null
      && attempt.study_run_correct === null
      && attempt.study_run_total === null
      && attempt.study_run_concept_ids === null;
  }
  return attempt.study_run_id === contract.studyRunId
    && attempt.study_run_segment === contract.segmentIndex
    && attempt.study_run_final === contract.segmentFinal
    && attempt.study_run_correct === correct
    && attempt.study_run_total === total
    && sameStringSet(attempt.study_run_concept_ids, contract.conceptIds);
}

function sameStringSet(left: string[] | null, right: string[]) {
  if (!left || left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function isStudyRunCoverageError(error: unknown) {
  if (!isRecord(error) || typeof error.message !== "string") return false;
  const message = error.message;
  return [
    "study run segment concepts",
    "study run segment repeats concept evidence",
    "final study run segment",
    "complete artifact coverage",
    "study run concept evidence cannot appear",
  ].some((fragment) => message.includes(fragment));
}

function parseReadinessProjection(value: unknown): ReadinessProjection | null {
  if (!isRecord(value)
      || value.schemaVersion !== 1
      || !["recent", "class", "exam"].includes(String(value.scopeType))
      || !isPercentageInteger(value.responseReadiness)
      || !isPercentageInteger(value.responseReadinessBefore)) {
    return null;
  }
  return {
    readiness: value.responseReadiness,
    readinessBefore: value.responseReadinessBefore,
  };
}

function parseLegacyReadinessProjection(value: unknown): LegacyReadinessProjection | null {
  if (!isRecord(value)
      || value.schemaVersion !== 0
      || !["recent", "class", "exam"].includes(String(value.scopeType))) {
    return null;
  }
  if (value.scopeType === "exam") {
    return value.responseReadiness === null && value.responseReadinessBefore === null
      ? { readiness: null, readinessBefore: null }
      : null;
  }
  if (!isPercentageInteger(value.responseReadiness)
      || !isPercentageInteger(value.responseReadinessBefore)) {
    return null;
  }
  return {
    readiness: value.responseReadiness,
    readinessBefore: value.responseReadinessBefore,
  };
}

function isPercentageInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 100;
}

function parsePracticeMasteryReservation(
  reservation: Record<string, unknown>,
): PracticeMasteryReservation {
  const previousStrength = typeof reservation.previousStrength === "number"
    ? reservation.previousStrength
    : 0;
  return {
    applied: reservation.masteryApplied === true,
    previousStrength,
    resultingStrength: typeof reservation.resultingStrength === "number"
      ? reservation.resultingStrength
      : previousStrength,
  };
}

async function studyResultRequestHash(
  artifactId: string,
  correct: number,
  total: number,
  perConcept: Map<string, {
    correct: boolean;
    confidence: ConfidenceLevel;
    recovered: boolean;
    firstSelectedIndex?: number;
    firstLeftPairId?: string;
    firstSelectedPairId?: string;
  }>,
  selectedIndex?: number,
  firstSelectedIndex?: number,
  evidence?: {
    evidenceTier: LearningEvidenceTier;
    targetTaskKind: TeachingTaskKind;
  },
  studyRun?: GroupedStudyRunSegment & { durationSeconds: number },
) {
  const canonicalResult: Record<string, unknown> = {
    ...(evidence
      ? {
          schemaVersion: "learning-evidence-v2",
          evidenceTier: evidence.evidenceTier,
          targetTaskKind: evidence.targetTaskKind,
        }
      : {}),
    artifactId,
    correct,
    total,
    perConcept: [...perConcept.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([conceptId, result]) => ({ conceptId, ...result })),
    ...(studyRun
      ? {
          studyRun: {
            schemaVersion: 2,
            studyRunId: studyRun.studyRunId,
            segmentIndex: studyRun.segmentIndex,
            segmentFinal: studyRun.segmentFinal,
            durationSeconds: studyRun.durationSeconds,
          },
        }
      : {}),
  };
  // Keep legacy hashes byte-for-byte compatible while binding a practice
  // attempt to the exact transfer choice the student submitted.
  if (selectedIndex !== undefined) canonicalResult.selectedIndex = selectedIndex;
  if (firstSelectedIndex !== undefined) canonicalResult.firstSelectedIndex = firstSelectedIndex;
  return sha256Hex(JSON.stringify(canonicalResult));
}

async function practiceResultClientRequestHash(result: {
  artifactId: string;
  selectedIndex: number;
  confidence: ConfidenceLevel;
  firstSelectedIndex: number;
  firstConfidence: ConfidenceLevel;
}) {
  return sha256Hex(JSON.stringify({
    schemaVersion: "assignment-tutor-result-v1",
    artifactId: result.artifactId,
    selectedIndex: result.selectedIndex,
    confidence: result.confidence,
    firstSelectedIndex: result.firstSelectedIndex,
    firstConfidence: result.firstConfidence,
  }));
}

async function sha256Hex(canonical: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return privateJsonResponse(body, status, corsHeaders);
}
