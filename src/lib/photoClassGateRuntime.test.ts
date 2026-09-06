// @vitest-environment node
// Execute the real Deno entrypoints and shared guards. Only the external
// Supabase transport, private storage, and vision provider are simulated.
import { buildSync } from "esbuild";
import { Blob } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CAPTURE_CLASS_GUARD_VERSION } from "../../supabase/functions/_shared/capture-class-guard";
import { CURRENT_FAMILY_BETA_AGREEMENT_VERSION } from "../../supabase/functions/_shared/family-beta-agreement";

type Row = Record<string, unknown>;
const userId = "student-qa";
const captureId = "10000000-0000-4000-8000-000000000001";
const materialId = "page-1";
const classId = "class-1";
const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const accounting = {
  sourceText: "Accounting: Assets = Liabilities + Equity. Debits increase cash; credits decrease cash.",
  summary: "The accounting equation, debits and credits, and the normal balance of cash.",
  concepts: ["Accounting Equation", "Debits", "Credits", "Normal Balance of Cash"].map((name) => ({ name })),
};
const math = {
  sourceText: "Algebra: solve the linear equation 2x + 4 = 10. Subtract 4 then divide by 2.",
  summary: "Algebra equations and solving for variables.",
  concepts: [{ name: "Solving linear equations", definition: "Use inverse operations to isolate x." }],
};
const learningTables = ["concepts", "concept_capture_evidence", "user_concept_mastery", "processed_content"];
const bundles: Record<string, string> = {};

beforeAll(() => {
  for (const name of ["process-capture-images", "extract-concepts"]) {
    bundles[name] = buildSync({
      entryPoints: [resolve(`supabase/functions/${name}/index.ts`)],
      bundle: true, write: false, platform: "node", format: "cjs", external: ["npm:*"],
    }).outputFiles[0].text;
  }
});

function harness(options: { control?: boolean; recovery?: boolean; missingRecoveryOcr?: boolean } = {}) {
  const vision = options.control ? math : accounting;
  const material = {
    id: materialId, user_id: userId, capture_id: captureId, kind: "image",
    storage_path: `${userId}/${captureId}/${hash(imageBytes)}.png`,
    mime_type: "image/png", size_bytes: imageBytes.length, content_hash: hash(imageBytes), page_index: 0,
  };
  const manifest = [{
    id: material.id, pageIndex: material.page_index, storagePath: material.storage_path,
    mimeType: material.mime_type, sizeBytes: material.size_bytes, contentHash: material.content_hash,
  }];
  const tables: Record<string, Row[]> = {
    family_beta_agreement_acceptances: [{
      user_id: userId, accepted_by: userId, agreement_version: CURRENT_FAMILY_BETA_AGREEMENT_VERSION,
      accepted_at: "2026-09-01T12:00:00Z",
    }],
    captures: [{
      id: captureId, user_id: userId, class_id: classId, client_class_id: "qa-class",
      kind: "scan-material", raw_text: options.recovery ? vision.sourceText : null,
      meta: { sourceImageCount: 1 }, processing_status: "failed", practice_source_version: 0,
      concept_extraction_claim_id: null, concept_extraction_started_at: null,
    }],
    classes: [{
      id: classId, user_id: userId, client_class_id: "qa-class", source_archived_at: null,
      name: options.control ? "QA — NEW 0831 Math" : "QA — NEW 0831 BIOL", meta: {},
    }],
    materials: [material],
    // Pre-existing accounting pollution must neither suppress the fresh gate
    // nor be cleaned up by this ticket. Recovery links it to the same capture.
    concepts: [{ id: "old-concept", user_id: userId, class_id: classId, name: "Accounting Equation", retired_at: "2026-08-31" }],
    concept_capture_evidence: [{
      user_id: userId, concept_id: "old-concept", capture_id: options.recovery ? captureId : "old-capture",
    }],
    user_concept_mastery: [],
    processed_content: options.recovery ? [{
      id: "old-result", user_id: userId, capture_id: captureId,
      model: `google/gemini-2.5-flash:${hash(JSON.stringify(manifest))}`,
      ocr_text: options.missingRecoveryOcr ? null : vision.sourceText,
      summary: vision.summary, key_concepts: vision.concepts.map((concept) => concept.name),
    }] : [],
  };
  const writes: { table: string; operation: string; values: unknown }[] = [];
  function from(table: string) {
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    const predicates: ((row: Row) => boolean)[] = [];
    let operation = "select";
    let values: Row | Row[] = {};
    let single = false;
    let limit = Infinity;
    const execute = () => {
      const matches = tables[table].filter((row) => predicates.every((p) => p(row))).slice(0, limit);
      let result = matches;
      if (operation !== "select") {
        writes.push({ table, operation, values: structuredClone(values) });
        if (operation === "update") {
          for (const row of matches) Object.assign(row, values);
        } else {
          result = (Array.isArray(values) ? values : [values]).map((row, i) => ({
            id: `new-${table}-${tables[table].length + i}`, ...row,
          }));
          tables[table].push(...result);
        }
      }
      return { data: structuredClone(single ? result[0] ?? null : result), error: null };
    };
    const query = {
      select: (_columns?: string) => query,
      eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { predicates.push((row) => row[key] !== value); return query; },
      is: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
      in: (key: string, items: unknown[]) => { predicates.push((row) => items.includes(row[key])); return query; },
      or: (_filter: string) => query,
      order: (_column: string, _options?: unknown) => query,
      limit: (count: number) => { limit = count; return query; },
      update: (input: Row) => { operation = "update"; values = input; return query; },
      insert: (input: Row | Row[]) => { operation = "insert"; values = input; return query; },
      upsert: (input: Row | Row[], _options?: unknown) => { operation = "upsert"; values = input; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolveResult: (result: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolveResult),
    };
    return query;
  }
  const download = vi.fn(async () => ({ data: new Blob([imageBytes]), error: null }));
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_study_write_pause") return { data: { paused: false }, error: null };
    if (name === "consume_ai_request_quota") return { data: true, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: userId } }, error: null }),
    },
    from, rpc, storage: { from: () => ({ download }) },
  };
  const provider = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(vision) } }],
  }), { status: 200 }));
  function load(name: string) {
    let handler: (req: Request) => Promise<Response>;
    runInNewContext(bundles[name], {
      require: (id: string) => {
        if (id === "npm:@supabase/supabase-js@2.110.1") return { createClient: () => client };
        if (id === "npm:@supabase/supabase-js@2.110.1/cors") return { corsHeaders: {} };
        throw new Error(`Unexpected import ${id}`);
      },
      Deno: {
        serve: (callback: typeof handler) => { handler = callback; },
        env: { get: (key: string) => key === "SUPABASE_URL" ? "https://example.invalid" : "test-only" },
      },
      crypto: webcrypto, Request, Response, Headers, TextEncoder, TextDecoder, Uint8Array,
      AbortController, AbortSignal, URL, console, setTimeout, clearTimeout, fetch: provider, btoa,
    });
    return async (body: Row, authenticated = true) => handler(new Request("https://example.invalid/function", {
      method: "POST", headers: authenticated ? { Authorization: "Bearer test-only" } : {},
      body: JSON.stringify(body),
    }));
  }
  return { tables, writes, download, rpc, provider, load,
    process: load("process-capture-images"),
    learningWrites: () => writes.filter((write) => learningTables.includes(write.table)),
  };
}

describe("PR #60 runtime photo class boundary", () => {
  it("probes an authenticated guard without source IDs, writes, downloads, quotas, or AI", async () => {
    const h = harness();
    const response = await h.process({ action: "verify-class-guard" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, classGuardVersion: CAPTURE_CLASS_GUARD_VERSION });
    expect(h.writes).toEqual([]);
    expect(h.download).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual(["get_study_write_pause"]);
    expect((await h.process({ action: "verify-class-guard" }, false)).status).toBe(401);
  });

  it("warns on fresh Scan Notes or Book into polluted BIOL, including a retry without Keep", async () => {
    const h = harness();
    const before = structuredClone(learningTables.map((table) => h.tables[table]));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await h.process({ captureId, materialIds: [materialId] });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true, classGuardVersion: CAPTURE_CLASS_GUARD_VERSION,
        classMismatch: { detectedSubject: "Accounting, business & economics", selectedClassName: "QA — NEW 0831 BIOL" },
      });
      expect(h.learningWrites()).toEqual([]);
      expect(learningTables.map((table) => h.tables[table])).toEqual(before);
      expect(h.tables.captures[0]).toMatchObject({ processing_status: "failed", raw_text: null });
    }
  });

  it("requires Keep before reactivating or repairing an older accounting result", async () => {
    const h = harness({ recovery: true });
    const response = await h.process({ captureId, materialIds: [materialId] });
    expect(await response.json()).toHaveProperty("classMismatch");
    expect(h.learningWrites()).toEqual([]);
    expect(h.provider).not.toHaveBeenCalled();
    const kept = await h.process({ captureId, materialIds: [materialId], keepInSelectedClass: true });
    expect(await kept.json()).toMatchObject({ ok: true, reused: true, classGuardVersion: CAPTURE_CLASS_GUARD_VERSION });
    expect(h.learningWrites().map((write) => write.table)).toEqual(expect.arrayContaining([
      "concepts", "concept_capture_evidence", "user_concept_mastery",
    ]));
  });

  it("rereads legacy recovery without OCR and warns before any study writes", async () => {
    const h = harness({ recovery: true, missingRecoveryOcr: true });
    expect(await (await h.process({ captureId, materialIds: [materialId] })).json()).toHaveProperty("classMismatch");
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.learningWrites()).toEqual([]);
  });

  it.each([
    { label: "explicit Keep", control: false, keep: true },
    { label: "legitimate Math", control: true, keep: false },
  ])("preserves normal ingestion for $label", async ({ control, keep }) => {
    const h = harness({ control });
    const response = await h.process({ captureId, materialIds: [materialId], ...(keep ? { keepInSelectedClass: true } : {}) });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ ok: true, classGuardVersion: CAPTURE_CLASS_GUARD_VERSION });
    expect(result).not.toHaveProperty("classMismatch");
    expect(h.learningWrites().map((write) => write.table)).toEqual(expect.arrayContaining(learningTables));
    expect(h.tables.captures[0]).toMatchObject({ processing_status: "ready" });
  });

  it("rejects scan-material on the text extractor even when a caller changes the supplied kind", async () => {
    const h = harness({ recovery: true });
    const textEndpoint = h.load("extract-concepts");
    const response = await textEndpoint({ captureId, kind: "quick-note", rawText: accounting.sourceText });
    expect(response.status).toBe(409);
    expect(await response.json()).toHaveProperty("error", "photo_class_check_required");
    expect(h.writes).toEqual([]);
    expect(h.provider).not.toHaveBeenCalled();
  });
});
