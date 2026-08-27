import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817123000_capture_attempt_idempotency.sql"),
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

describe("capture attempt database integrity", () => {
  it("enforces one capture, page, and capture signal per stable retry key", () => {
    expect(migration.trim()).toMatch(/^--[\s\S]*\nBEGIN;[\s\S]*\nCOMMIT;$/);
    expect(migration).toMatch(/captures_owner_local_id_unique[\s\S]*user_id, local_id/i);
    expect(migration).toMatch(/materials_capture_page_unique[\s\S]*capture_id, page_index/i);
    expect(migration).toMatch(/campus_brain_signal_source_unique[\s\S]*user_id, source_type, source_id/i);
    expect(migration).toMatch(/topic_signal_capture_source_unique[\s\S]*source_type LIKE 'capture:%'/i);
    expect(persistence).toMatch(/upsert: false/);
    expect(persistence).toContain('.insert(materialValues)');
    expect(persistence).toContain('.eq("capture_id", captureId)');
    expect(persistence).toContain('.eq("page_index", pageIndex)');
    expect(persistence).not.toContain('.upsert({\n          capture_id: captureId');
  });

  it("fingerprints the full capture request and never destructively rolls back an adoptable retry", () => {
    expect(persistence).toContain("captureRequestFingerprint: requestFingerprint");
    expect(persistence).toContain("savedFingerprint !== requestFingerprint");
    expect(persistence).toContain("mock-v1:${requestFingerprint}");
    expect(requestMigration).toContain("processed_content_capture_request_unique");
    expect(requestMigration).toContain("model ~ '^mock-v1:[0-9a-f]{64}$'");
    expect(persistence).not.toContain("newlyCreatedMaterialIds");
    expect(persistence).not.toContain("newlyUploadedPaths");
    expect(persistence).toContain("Never tear down a durable capture from the browser");
  });
});
