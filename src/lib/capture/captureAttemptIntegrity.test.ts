import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817123000_capture_attempt_idempotency.sql"),
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
    expect(persistence).toMatch(/upsert: true/);
    expect(persistence).toMatch(/onConflict: "capture_id,page_index"/);
  });
});
