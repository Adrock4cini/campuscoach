import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827132000_capture_storage_integrity.sql"),
  "utf8",
);
const requestMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827126750_capture_request_idempotency.sql"),
  "utf8",
);
const persistence = readFileSync(
  resolve(process.cwd(), "src/lib/supabase/capturePersistence.ts"),
  "utf8",
);
const processor = readFileSync(
  resolve(process.cwd(), "supabase/functions/process-capture-images/index.ts"),
  "utf8",
);
const cleanupWorker = readFileSync(
  resolve(process.cwd(), "supabase/functions/cleanup-abandoned-captures/index.ts"),
  "utf8",
);
const functionConfig = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);

describe("capture source Storage integrity", () => {
  it("fails closed on legacy provenance before installing strict immutable source triggers", () => {
    expect(migration.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
    expect(migration).toContain("Legacy capture source provenance must be remediated");
    expect(migration).toContain("material.capture_id::text");
    expect(migration).toContain("material.content_hash");
    expect(migration).toContain("capture.user_id = material.user_id");
    expect(migration).toContain("object.name = material.storage_path");
    expect(migration).toContain("object.metadata->>'size'");
    expect(migration).toContain("Noncanonical capture source objects must be inventoried");
    expect(migration).toContain("material.kind IS DISTINCT FROM 'image'");
    expect(migration).toContain("capture.kind IN ('scan-assignment', 'scan-material')");
    expect(migration).toContain("Legacy cross-owner scan material links must be remediated");
    expect(migration).toContain("capture.user_id IS DISTINCT FROM material.user_id");
    expect(migration).toContain("capture.meta->>'sourceImageCount'");
  });

  it("binds every processed result to the referenced capture owner before global retry uniqueness", () => {
    expect(requestMigration).toContain("Cross-owner processed capture rows must be remediated");
    expect(requestMigration).toContain("capture.user_id IS DISTINCT FROM processed.user_id");
    expect(requestMigration).toContain("DROP CONSTRAINT processed_content_capture_id_fkey");
    expect(requestMigration).toContain("FOREIGN KEY (capture_id, user_id)");
    expect(requestMigration.indexOf("processed_content_capture_owner_fkey")).toBeLessThan(
      requestMigration.indexOf("processed_content_capture_request_unique"),
    );
  });

  it("gates strict owner/capture/hash uploads on agreement and serialized quotas", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_upload_capture_source");
    expect(migration).toContain("v_parts[1] IS DISTINCT FROM v_user_id::text");
    expect(migration).toContain("v_capture_id := v_parts[2]::uuid");
    expect(migration).toContain("receipt.agreement_version = v_current_agreement_version");
    expect(migration).toContain("v_current_agreement_version constant text := '2026-08-17'");
    expect(migration).toContain("'capture-source-path:' || p_path");
    expect(migration).toContain("'capture-source-owner:' || v_user_id::text");
    expect(migration).toContain("v_max_capture_objects constant integer := 4");
    expect(migration).toContain("v_max_owner_orphans constant integer := 12");
    expect(migration).toContain("v_max_owner_objects constant integer := 256");
    expect(migration).toContain("v_max_owner_bytes constant bigint := 512000000");
    expect(migration).toContain("capture.concept_extraction_claim_id IS NULL");
    const uploadBoundary = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.can_upload_capture_source"),
      migration.indexOf("REVOKE ALL ON FUNCTION public.can_upload_capture_source"),
    );
    expect(uploadBoundary).toContain("FROM public.concepts concept");
    expect(uploadBoundary).toContain("FROM public.concept_capture_evidence evidence");
    expect(uploadBoundary).toContain("FROM public.processed_content processed");
    expect(migration).toContain("capture_sources_integrity_insert");
    expect(migration).toContain("ON storage.objects AS RESTRICTIVE FOR INSERT");
  });

  it("denies byte overwrite and committed browser deletion", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.captures, public.materials FROM anon");
    expect(migration).toContain("DROP POLICY IF EXISTS capture_sources_owner_update");
    expect(migration).toContain("capture_sources_immutable_update");
    expect(migration).toContain("USING (bucket_id <> 'capture-sources')");
    expect(migration).toContain("can_delete_uncommitted_capture_source");
    expect(migration).toMatch(/can_delete_uncommitted_capture_source[\s\S]*LANGUAGE plpgsql[\s\S]*VOLATILE/);
    expect(migration).toMatch(/can_delete_uncommitted_capture_source[\s\S]*capture-source-path:[\s\S]*WHERE material\.storage_path = p_path/);
    expect(migration).toMatch(/can_delete_uncommitted_capture_source[\s\S]*capture_source_cleanup_claims/);
    expect(migration).toContain("WHERE material.storage_path = p_path");
    expect(migration).toContain("Capture material source fields are immutable");
    expect(migration).toContain("Processed capture sources require server-side cleanup");
  });

  it("serializes material rollback with the worker lifecycle claim", () => {
    expect(migration).toMatch(/protect_capture_material_source_deletion[\s\S]*FROM public\.captures capture[\s\S]*FOR UPDATE/);
    expect(migration).toContain("OR v_claim_id IS NOT NULL");
    const materialReadIndex = processor.indexOf('.from("materials")');
    const claimIndex = processor.lastIndexOf("const acquisition = await acquireClaim();", materialReadIndex);
    expect(claimIndex).toBeGreaterThan(-1);
    expect(claimIndex).toBeLessThan(materialReadIndex);
    expect(processor.slice(materialReadIndex, processor.indexOf("const content:", materialReadIndex)))
      .toContain("await failClaim()");
  });

  it("closes the complete scan material set before a worker can read it", () => {
    expect(migration).toMatch(/enforce_capture_material_source_integrity[\s\S]*capture\.kind,[\s\S]*FROM public\.captures capture[\s\S]*FOR UPDATE/);
    expect(migration).toContain("v_capture_kind NOT IN ('scan-assignment', 'scan-material')");
    expect(migration).toContain("NEW.kind IS DISTINCT FROM 'image'");
    expect(migration).toContain("v_claim_id IS NOT NULL");
    expect(migration).toContain("Capture material set is closed for processing");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS materials_storage_path_lookup");
    expect(migration).toContain("FROM public.concept_capture_evidence evidence");
    expect(migration).toContain("FROM public.processed_content processed");
    expect(migration).toContain("NEW.page_index >= v_expected_source_count");
  });

  it("serializes capture deletion with workers and denies any active or derived capture", () => {
    const finalGuard = migration.indexOf("CREATE OR REPLACE FUNCTION public.protect_capture_deletion()");
    expect(finalGuard).toBeGreaterThan(-1);
    const guard = migration.slice(finalGuard, migration.indexOf("-- A private, fenced ledger", finalGuard));
    expect(guard).toContain("OLD.concept_extraction_claim_id IS NOT NULL");
    expect(guard).toContain("FROM public.concept_capture_evidence evidence");
    expect(guard).toContain("FROM public.concepts concept");
    expect(guard).toContain("FROM public.processed_content processed");
    expect(guard).toContain("FROM public.learning_artifacts artifact");
  });

  it("scopes immutable source fields to capture-source image paths", () => {
    expect(migration).toMatch(/protect_capture_material_source_mutation[\s\S]*OLD\.kind = 'image'[\s\S]*NEW\.kind = 'image'/);
    expect(migration).toContain("Older audio/document material keeps its existing lifecycle");
  });

  it("uses one physical owner/capture/hash object and insert-only exact retries", () => {
    expect(migration).toContain("v_parts[2] IS DISTINCT FROM NEW.capture_id::text");
    expect(persistence).toContain("buildCaptureStoragePath(userId, captureId, file, contentHash)");
    expect(persistence).toContain("upsert: false");
    expect(persistence).toContain(".insert(materialValues)");
    expect(persistence).toContain("const exactRetry =");
    expect(persistence).toContain("new CaptureSourceRetryConflictError()");
    expect(persistence).not.toMatch(/\.eq\("content_hash", contentHash\)[\s\S]{0,250}\.limit\(1\)/);
    expect(persistence).not.toContain("upsert: true");
  });

  it("verifies downloaded bytes before any paid image request", () => {
    expect(processor).toContain("raw_text, meta, assignment_id");
    expect(processor).toContain("captureMeta?.sourceImageCount");
    expect(processor).toContain("materials.length !== expectedSourceImageCount");
    expect(processor).toContain('.select("id, kind, storage_path, mime_type, size_bytes, content_hash, page_index")');
    expect(processor).toContain("pathParts[1] !== body.captureId");
    expect(processor).toContain("const actualHash = await sha256Hex(imageBuffer)");
    expect(processor).toContain("actualHash !== material.content_hash");
    expect(processor).toContain("capture_source_integrity_failed");
    expect(processor.indexOf("actualHash !== material.content_hash")).toBeLessThan(
      processor.indexOf("gatewayResult = await executePaidAiRequest("),
    );
    const sourceQuota = processor.indexOf('functionPrefix: "process-capture-images-source-read"');
    const download = processor.indexOf('.download(material.storage_path!)');
    const recovery = processor.indexOf("const recoveryResponse = await recoverExistingScanMaterial()");
    const paidAi = processor.indexOf("gatewayResult = await executePaidAiRequest(");
    expect(sourceQuota).toBeGreaterThan(-1);
    expect(sourceQuota).toBeLessThan(download);
    expect(download).toBeLessThan(recovery);
    expect(recovery).toBeLessThan(paidAi);
    expect(processor).toContain("signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)");
    expect(processor).toContain("fetch: fetchWithStorageTimeout");
    expect(processor).toContain("AbortSignal.timeout(STORAGE_DOWNLOAD_TIMEOUT_MS)");
    expect(processor).not.toContain("google/gemini-2.5-flash-vision");
  });

  it("recovers only evidence bound to the exact immutable source manifest", () => {
    expect(processor).toContain("const sourceManifestHash = await sha256Text");
    expect(processor).toContain("const processedModel = `google/gemini-2.5-flash:${sourceManifestHash}`");
    expect(processor).toContain('.eq("model", processedModel)');
    expect(processor).not.toContain("Transitional fallback repairs a primary concept");
    expect(processor).not.toContain(': existingQuery.eq("capture_id", body.captureId)');
    const provider = processor.indexOf("gatewayResult = await executePaidAiRequest(");
    const renewal = processor.lastIndexOf("const providerLease = await renewClaim()", provider);
    expect(renewal).toBeGreaterThan(-1);
    expect(renewal).toBeLessThan(provider);
  });

  it("retires SQL Storage deletion and cleans only fenced 24-hour orphans via the API", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS materials_remove_unreferenced_source");
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.remove_unreferenced_capture_source()");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).toContain("coalesce(p_before, v_now - interval '24 hours')");
    expect(migration).toContain("p_limit NOT BETWEEN 1 AND 50");
    expect(migration).toContain("v_now + interval '15 minutes'");
    expect(migration).toContain("materials_00_guard_capture_source_cleanup_claim");
    expect(migration).toContain("confirm_capture_cleanup_claims");
    expect(migration).toMatch(/ORDER BY object\.name[\s\S]*confirm_capture_cleanup_claims/);
    expect(cleanupWorker).toContain("const BATCH_LIMIT = 50");
    expect(cleanupWorker).toContain("admin.storage.from(BUCKET).remove(confirmedPaths)");
    expect(cleanupWorker.indexOf('"confirm_capture_cleanup_claims"')).toBeLessThan(
      cleanupWorker.indexOf(".remove(confirmedPaths)"),
    );
    expect(cleanupWorker.indexOf(".remove(confirmedPaths)")).toBeLessThan(
      cleanupWorker.indexOf('"release_capture_cleanup_claims"'),
    );
    expect(cleanupWorker).toContain("assertExactRemovedPaths(removedRows, confirmedPaths)");
    expect(cleanupWorker.indexOf("assertExactRemovedPaths(removedRows, confirmedPaths)")).toBeLessThan(
      cleanupWorker.indexOf('"release_capture_cleanup_claims"'),
    );
  });

  it("keeps the internal cleanup route secret-bound, private, and service-only", () => {
    expect(cleanupWorker).toContain('req.headers.get("x-cleanup-secret")');
    expect(cleanupWorker).toContain("constantTimeEqualHex(suppliedDigest, expectedDigest)");
    expect(cleanupWorker).toContain('admin.rpc("get_capture_cleanup_invocation_digest")');
    expect(cleanupWorker).toContain("withPrivateJsonErrors(req, {}");
    expect(cleanupWorker).toContain("logPrivateFailure({");
    expect(cleanupWorker).not.toContain("claimError.message");
    expect(cleanupWorker).not.toContain("confirmedPaths.join");
    expect(cleanupWorker).toContain('return json({ error: "Request body must be empty" }, 400)');
    expect(cleanupWorker).toContain("p_before: null");
    expect(cleanupWorker).not.toContain("ALLOW_CAPTURE_CLEANUP_TEST_MODE");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.claim_abandoned_capture_sources(uuid, integer, timestamptz)\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_abandoned_capture_sources(uuid, integer, timestamptz)\n  TO service_role",
    );
    expect(functionConfig).toMatch(
      /\[functions\.cleanup-abandoned-captures\]\s+verify_jwt = false/,
    );
  });
});
