import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816120000_abandoned_syllabus_cleanup.sql"),
  "utf8",
);
const edgeFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/cleanup-abandoned-syllabi/index.ts"),
  "utf8",
);
const runbook = readFileSync(resolve(process.cwd(), "docs/syllabus-cleanup.md"), "utf8");
const functionConfig = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("abandoned syllabus source cleanup contract", () => {
  it("uses a bounded 24-hour claim and Storage API deletion only", () => {
    expect(migration).toContain("coalesce(p_before, v_now - interval '24 hours')");
    expect(migration).toContain("p_limit NOT BETWEEN 1 AND 50");
    expect(edgeFunction).toContain("const BATCH_LIMIT = 50");
    expect(edgeFunction).toContain("admin.storage.from(BUCKET).remove(confirmedPaths)");
    expect(migration).toContain("syllabus_source_cleanup_claims_lease_lookup");
    expect(migration).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*\sON\s+storage\.objects/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(edgeFunction).not.toMatch(/from\(["']storage\.objects["']\).*delete/i);
  });

  it("preserves committed and request-required sources with one authoritative no-op exception", () => {
    const syllabusExclusions = migration.match(
      /NOT EXISTS \(\s*SELECT 1 FROM public\.class_syllabi/g,
    );
    const requestExclusions = migration.match(
      /NOT EXISTS \(\s*SELECT 1 FROM public\.class_syllabus_requests/g,
    );
    expect(syllabusExclusions?.length).toBeGreaterThanOrEqual(2);
    expect(requestExclusions?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(
      /request\.result->>'cleanupPath' IS DISTINCT FROM request\.storage_path/g,
    )?.length).toBeGreaterThanOrEqual(3);
    expect(runbook).toContain("still required by `class_syllabus_requests` remains");
    expect(runbook).toContain("retryable after its duplicate source is removed");
  });

  it("retries crashed sweeps with fenced leases longer than Edge lifetime", () => {
    expect(migration).toContain("claim_token uuid NOT NULL");
    expect(migration).toContain("v_now + interval '15 minutes'");
    expect(migration).toContain("claim.lease_expires_at <= v_now");
    expect(migration).toContain("claim.claim_token = p_claim_token");
    expect(edgeFunction).toContain("const DOWNSTREAM_TIMEOUT_MS = 30_000");
    expect(edgeFunction.indexOf("confirm_syllabus_cleanup_claims")).toBeLessThan(
      edgeFunction.indexOf(".remove(confirmedPaths)"),
    );
    expect(edgeFunction.indexOf(".remove(confirmedPaths)")).toBeLessThan(
      edgeFunction.indexOf("release_syllabus_cleanup_claims"),
    );
    expect(migration).toContain("NOT EXISTS (\n          SELECT 1 FROM storage.objects object");
    expect(migration).toContain("LIMIT 200");
    expect(migration).toContain(
      "ON CONFLICT ON CONSTRAINT syllabus_source_cleanup_claims_pkey DO UPDATE",
    );
    expect(migration).not.toContain("ON CONFLICT (storage_path) DO UPDATE");
  });

  it("blocks a late commit for the full live claim and fences concurrent runs", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_path, 0))");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(NEW.storage_path, 0))");
    expect(migration).toContain("claim.lease_expires_at > v_now");
    expect(migration).toContain("CREATE TRIGGER class_syllabi_00_guard_cleanup_claim");
    expect(migration).toContain("CREATE TRIGGER class_syllabus_requests_00_guard_cleanup_claim");
    expect(migration).toContain("PostgreSQL fires same-timing triggers alphabetically");
    expect("class_syllabi_00_guard_cleanup_claim" < "class_syllabi_enforce_integrity").toBe(true);
    expect(migration).toContain("Syllabus source upload expired while it was awaiting review");
  });

  it("bootstraps one Vault-bound invocation secret without checking plaintext into source", () => {
    expect(migration).toContain("invoke_secret_id uuid NOT NULL UNIQUE");
    expect(migration).toContain("invoke_secret_digest bytea NOT NULL");
    expect(migration).toContain("octet_length(invoke_secret_digest) = 32");
    expect(migration).toContain("encode(extensions.gen_random_bytes(32), 'hex')");
    expect(migration).toContain("v_invoke_secret_id := vault.create_secret(");
    expect(migration).toContain("LEFT JOIN vault.decrypted_secrets secret");
    expect(migration).toContain("ON CONFLICT (singleton) DO UPDATE");
    expect(migration).toContain("invoke_secret_id = EXCLUDED.invoke_secret_id");
    expect(migration).toContain("pg_advisory_xact_lock(");
    expect(migration).toContain("get_syllabus_cleanup_invocation_digest");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_syllabus_cleanup_invocation_digest()",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_syllabus_cleanup_invocation_digest()\n  TO service_role",
    );
    expect(edgeFunction).not.toContain("SYLLABUS_CLEANUP_INVOKE_SECRET");
  });

  it("authenticates fail-closed before every cleanup claim", () => {
    expect(edgeFunction).toContain('req.headers.get("x-cleanup-secret")');
    expect(edgeFunction).toContain("const INVOCATION_SECRET = /^[0-9a-f]{64}$/");
    expect(edgeFunction).toContain("await sha256Hex(suppliedInvokeSecret)");
    expect(edgeFunction).toContain("constantTimeEqualHex(suppliedDigest, expectedDigest)");
    expect(edgeFunction).toContain('admin.rpc("get_syllabus_cleanup_invocation_digest")');
    expect(edgeFunction).toContain("INVOCATION_DIGEST_CACHE_MS = 10_000");
    expect(edgeFunction.indexOf("getInvocationDigest(admin)")).toBeLessThan(
      edgeFunction.indexOf('"claim_abandoned_syllabus_sources"'),
    );
    expect(edgeFunction.indexOf("constantTimeEqualHex(suppliedDigest, expectedDigest)")).toBeLessThan(
      edgeFunction.indexOf('"claim_abandoned_syllabus_sources"'),
    );
    expect(edgeFunction).toContain("withPrivateJsonErrors(req, {}");
    expect(edgeFunction).toContain("logPrivateFailure({");
    expect(edgeFunction).toContain("privateJsonResponse(body, status, {}, { requestId })");
    expect(edgeFunction).toContain("return json(undefined, 503)");
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_SECRET_KEYS")');
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edgeFunction).toContain('Deno.env.get("ALLOW_SYLLABUS_CLEANUP_TEST_MODE") !== "true"');
    expect(edgeFunction).toContain('requestedTestBefore === "now"');
  });

  it("returns private request-correlated errors without logging database or Storage details", () => {
    expect(edgeFunction).toContain('from "../_shared/private-json-response.ts"');
    expect(edgeFunction).toContain('errorClass: "syllabus_cleanup_claim_failed"');
    expect(edgeFunction).toContain('errorClass: "syllabus_cleanup_confirm_failed"');
    expect(edgeFunction).toContain('errorClass: "syllabus_storage_cleanup_failed"');
    expect(edgeFunction).toContain('errorClass: "syllabus_cleanup_release_failed"');
    expect(edgeFunction).toContain('event: "syllabus_source_cleanup_completed"');
    expect(edgeFunction).toContain("requestId,");
    expect(edgeFunction).not.toContain("claimError.message");
    expect(edgeFunction).not.toContain("confirmError.message");
    expect(edgeFunction).not.toContain("removeError.message");
    expect(edgeFunction).not.toContain("releaseError.message");
    expect(edgeFunction).not.toMatch(/console\.error/);
  });

  it("binds cron to exact Vault UUIDs and documents atomic rotation", () => {
    expect(migration).toContain("project_url_secret_id uuid UNIQUE");
    expect(runbook).toContain("avoids modifying the\n  read-only Storage schema");
    expect(functionConfig).toMatch(
      /\[functions\.cleanup-abandoned-syllabi\]\s+verify_jwt = false/,
    );
    expect(runbook).toContain("invoke_secret.id = configuration.invoke_secret_id");
    expect(runbook).toContain("project_url.id = configuration.project_url_secret_id");
    expect(runbook).not.toContain("where name = 'syllabus_cleanup_invoke_secret'");
    expect(runbook).toContain("v_project_ref !~ '^[a-z]{20}$'");
    expect(runbook).toContain("format('https://%s.supabase.co', v_project_ref)");
    expect(runbook).toContain("'cleanup-abandoned-syllabus-sources'");
    expect(runbook).toContain("'17 * * * *'");
    expect(runbook).toContain("Syllabus cleanup Vault configuration is missing or invalid");
    expect(runbook).toContain("v_invoke_secret !~ '^[0-9a-f]{64}$'");
    expect(runbook).toContain("perform vault.update_secret(");
    expect(runbook).toContain("invoke_secret_digest = extensions.digest(");
    expect(runbook).toContain("The `DO`\nstatement is one database transaction");
    expect(runbook).toContain("without `x-cleanup-secret`: expect HTTP 401");
    expect(runbook).toContain("HTTP 403");
    expect(runbook).toContain("expect HTTP 503");
    expect(runbook).not.toContain("syllabus_cleanup_service_role_key");
    expect(runbook).not.toContain("SYLLABUS_CLEANUP_INVOKE_SECRET");
    expect(runbook).toContain("production no-op run returns HTTP 200");
  });
});
