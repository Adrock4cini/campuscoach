import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  analyzeMigrationSql,
  assertGitCandidateManifest,
  buildAttemptPayload,
  buildBootstrapPayload,
  buildGatePayload,
  buildMigrationPayload,
  CONTROL_SCHEMA,
  EXPECTED_FINAL_MIGRATION_VERSION,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_OUTER_TRANSACTION_FILES,
  LovableStagingPayloadFailure,
  POST_PHASE_GATES,
  PROTECTED_LOVABLE_PROJECT_IDS,
  readLovableMigrationManifest,
  scanTopLevelSql,
  selectMigration,
} from "../../../scripts/generate-lovable-staging-migration-payload.mjs";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const CANDIDATE_SHA = "a".repeat(40);
const ATTEMPT_NONCE = "11111111-1111-4111-8111-111111111111";

function configFor(entry: { ordinal: number; version: string }) {
  return {
    projectId: PROJECT_ID,
    candidateSha: CANDIDATE_SHA,
    ordinal: entry.ordinal,
    version: entry.version,
    attemptNonce: ATTEMPT_NONCE,
  };
}

describe("Lovable Cloud staging migration payloads", () => {
  const manifest = readLovableMigrationManifest();

  it("builds one deterministic, exact 63-file manifest", () => {
    expect(manifest.entries).toHaveLength(EXPECTED_MIGRATION_COUNT);
    expect(manifest.entries.at(-1)?.version).toBe(EXPECTED_FINAL_MIGRATION_VERSION);
    expect(new Set(manifest.entries.map(({ version }) => version)).size).toBe(63);
    expect(new Set(manifest.entries.map(({ filename }) => filename)).size).toBe(63);
    expect(manifest.inventorySha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(readLovableMigrationManifest()).toEqual(manifest);

    for (const entry of manifest.entries) {
      const bytes = Buffer.from(entry.sql, "utf8");
      const expectedBlob = createHash("sha1")
        .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
        .update(bytes)
        .digest("hex");
      expect(entry.ordinal).toBe(manifest.entries.indexOf(entry) + 1);
      expect(entry.version).toBe(entry.filename.slice(0, 14));
      expect(entry.fileSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(entry.gitBlobSha1).toBe(expectedBlob);
    }
  });

  it("binds every working migration byte to the exact clean candidate tree", () => {
    const rows = manifest.entries.map((entry) => (
      `100644 blob ${entry.gitBlobSha1}\t${entry.path}`
    )).join("\n");
    const runGit = (args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return process.cwd();
      if (args[0] === "status") return "";
      if (args[0] === "rev-parse") return CANDIDATE_SHA;
      if (args[0] === "ls-tree") return rows;
      throw new Error(`unexpected git command ${args.join(" ")}`);
    };
    expect(() => assertGitCandidateManifest(
      CANDIDATE_SHA,
      manifest,
      process.cwd(),
      runGit,
    )).not.toThrow();

    expect(() => assertGitCandidateManifest(
      CANDIDATE_SHA,
      manifest,
      process.cwd(),
      (args: string[]) => args[0] === "status" ? " M unsafe.sql" : runGit(args),
    )).toThrow("completely clean");

    expect(() => assertGitCandidateManifest(
      CANDIDATE_SHA,
      manifest,
      process.cwd(),
      (args: string[]) => args[0] === "ls-tree" ? rows.replace(/blob [0-9a-f]{40}/u, `blob ${"f".repeat(40)}`) : runGit(args),
    )).toThrow("do not exactly match");
  });

  it("locks the reviewed outer-transaction topology to exactly 16 files", () => {
    const outerFiles = manifest.entries
      .filter(({ hasOuterTransaction }) => hasOuterTransaction)
      .map(({ filename }) => filename);
    expect(outerFiles).toEqual(EXPECTED_OUTER_TRANSACTION_FILES);
    expect(outerFiles).toHaveLength(16);
  });

  it("forbids every protected Lovable project in all four payload builders", () => {
    expect(PROTECTED_LOVABLE_PROJECT_IDS).toEqual([
      "a08a7f00-4b76-4d5b-ac89-2c15e604054a",
      "14ee9834-144c-4923-9963-b5389d0cc4ca",
      "22053d35-bc57-4b25-a9a5-3a7ed8e158b2",
      "33bcdaaa-6765-4b62-a375-a58b661726ea",
      "0b0043fb-1222-49bd-a350-a068bcb3d844",
      "45c02d1f-91a2-4b8d-8fcd-eea6402e45ad",
    ]);
    for (const projectId of PROTECTED_LOVABLE_PROJECT_IDS) {
      expect(() => buildBootstrapPayload({
        projectId,
        candidateSha: CANDIDATE_SHA,
      }, manifest)).toThrow("forbidden for this Lovable project");
      expect(() => buildAttemptPayload({
        ...configFor(manifest.entries[0]),
        projectId,
      }, manifest)).toThrow("forbidden for this Lovable project");
      expect(() => buildGatePayload({
        projectId,
        candidateSha: CANDIDATE_SHA,
        ordinal: POST_PHASE_GATES[0].targetOrdinal,
        version: POST_PHASE_GATES[0].targetVersion,
        gateAttestation: POST_PHASE_GATES[0].attestation,
      }, manifest)).toThrow("forbidden for this Lovable project");
      expect(() => buildMigrationPayload({
        ...configFor(manifest.entries[0]),
        projectId,
      }, manifest)).toThrow("forbidden for this Lovable project");
    }
  });

  it("creates a private control schema and never impersonates Supabase's ledger", () => {
    const payload = buildBootstrapPayload({
      projectId: PROJECT_ID,
      candidateSha: CANDIDATE_SHA,
    }, manifest);
    expect(payload).toContain(`CREATE SCHEMA ${CONTROL_SCHEMA};`);
    expect(payload).toContain(`CREATE TABLE ${CONTROL_SCHEMA}.manifest`);
    expect(payload).toContain(`CREATE TABLE ${CONTROL_SCHEMA}.state`);
    expect(payload).toContain(`CREATE TABLE ${CONTROL_SCHEMA}.applied`);
    expect(payload).toContain(`CREATE TABLE ${CONTROL_SCHEMA}.gate_attestations`);
    expect(payload).toContain("staging target contains auth users");
    expect(payload).toContain("staging target contains public functions");
    expect(payload).toContain("staging target contains public views");
    expect(payload).toContain("staging target contains public materialized views");
    expect(payload).toContain("staging target contains public sequences");
    expect(payload).toContain("staging target contains public types");
    expect(payload).toContain("canonical migration ledger is not empty");
    expect(payload).toContain("staging target contains storage objects");
    expect(payload).toContain("staging target contains storage object policies");
    expect(payload).toContain("staging target contains unexpected storage buckets");
    expect(payload).toContain("staging target contains cron jobs");
    expect(payload).toContain("staging target contains vault secrets");
    expect(payload).not.toMatch(/(?:insert|update|delete|create|alter)\s+(?:into\s+)?supabase_migrations\.schema_migrations/iu);
    expect(payload.match(/^ {2}\(\d+, '\d{14}',/gmu)).toHaveLength(64);
    for (const entry of manifest.entries) {
      expect(payload).toContain(entry.fileSha256);
      expect(payload).toContain(entry.gitBlobSha1);
    }
    const analysis = analyzeMigrationSql(payload);
    expect(analysis.hasOuterTransaction).toBe(true);
  });

  it("emits one durable attempt marker for one exact ordinal/version pair", () => {
    const entry = manifest.entries[50];
    const payload = buildAttemptPayload(configFor(entry), manifest);
    expect(payload).toContain("status = 'executing'");
    expect(payload).toContain(`pending_version = '${entry.version}'`);
    expect(payload).toContain(`v_state.current_ordinal <> ${entry.ordinal - 1}`);
    expect(payload).toContain(entry.fileSha256);
    expect(payload).toContain(entry.gitBlobSha1);
    expect(payload).toContain(ATTEMPT_NONCE);
    expect(analyzeMigrationSql(payload).hasOuterTransaction).toBe(true);
  });

  it("encodes the exact 13 documented post-phase gates", () => {
    expect(POST_PHASE_GATES).toEqual([
      [51, "20260827125500", 52, "20260827126000", "writes-paused-edge-deployed-tested-drained"],
      [52, "20260827126000", 53, "20260827126500", "writes-paused-agreement-migration-verified"],
      [53, "20260827126500", 54, "20260827126750", "writes-paused-raw-input-guard-verified"],
      [54, "20260827126750", 55, "20260827127500", "writes-paused-agreement-ui-canaries-passed"],
      [55, "20260827127500", 56, "20260827130000", "writes-paused-mirror-retirement-verified"],
      [56, "20260827130000", 57, "20260827132000", "writes-paused-capture-lockdown-verified"],
      [57, "20260827132000", 58, "20260827133000", "writes-paused-storage-integrity-verified"],
      [58, "20260827133000", 59, "20260827134000", "writes-paused-learning-evidence-guard-verified"],
      [59, "20260827134000", 60, "20260827135000", "writes-paused-class-owner-scope-verified"],
      [60, "20260827135000", 61, "20260827140000", "writes-paused-launch-schema-regression-verified"],
      [61, "20260827140000", 62, "20260828100000", "writes-paused-onboarding-owner-guard-verified"],
      [62, "20260828100000", 63, "20260828110000", "writes-paused-evidence-contract-edge-deployed-verified"],
      [63, "20260828110000", 64, "20260830231658", "writes-paused-practice-source-confirmation-verified"],
    ].map(([previousOrdinal, previousVersion, targetOrdinal, targetVersion, attestation]) => ({
      previousOrdinal,
      previousVersion,
      targetOrdinal,
      targetVersion,
      attestation,
    })));
  });

  it("records only the exact next gate while ready at its exact prior ordinal", () => {
    for (const gate of POST_PHASE_GATES) {
      const entry = manifest.entries[gate.targetOrdinal - 1];
      const payload = buildGatePayload({
        projectId: PROJECT_ID,
        candidateSha: CANDIDATE_SHA,
        ordinal: gate.targetOrdinal,
        version: gate.targetVersion,
        gateAttestation: gate.attestation,
      }, manifest);
      expect(entry.version).toBe(gate.targetVersion);
      expect(payload).toContain("v_state.status <> 'ready'");
      expect(payload).toContain(`v_state.current_ordinal <> ${gate.previousOrdinal}`);
      expect(payload).toContain(`v_applied_count <> ${gate.previousOrdinal}`);
      expect(payload).toContain(`applied.ordinal = ${gate.previousOrdinal}`);
      expect(payload).toContain(`applied.version = '${gate.previousVersion}'`);
      expect(payload).toContain(`existing.target_ordinal = ${gate.targetOrdinal}`);
      expect(payload).toContain(`'${gate.attestation}'`);
      expect(payload).toContain(`INSERT INTO ${CONTROL_SCHEMA}.gate_attestations`);
      expect(analyzeMigrationSql(payload).hasOuterTransaction).toBe(true);

      expect(() => buildGatePayload({
        projectId: PROJECT_ID,
        candidateSha: CANDIDATE_SHA,
        ordinal: gate.targetOrdinal,
        version: gate.targetVersion,
        gateAttestation: `${gate.attestation}-wrong`,
      }, manifest)).toThrow("must exactly equal");
    }
    expect(() => buildGatePayload({
      projectId: PROJECT_ID,
      candidateSha: CANDIDATE_SHA,
      ordinal: 51,
      version: manifest.entries[50].version,
      gateAttestation: POST_PHASE_GATES[0].attestation,
    }, manifest)).toThrow("not one of the 13 gated");
  });

  it("allows ordinals 1-51 without gates and blocks 52-64 without the exact durable gate", () => {
    for (const entry of manifest.entries) {
      const attempt = buildAttemptPayload(configFor(entry), manifest);
      const migration = buildMigrationPayload(configFor(entry), manifest);
      if (entry.ordinal <= 51) {
        expect(attempt).not.toContain(`FROM ${CONTROL_SCHEMA}.gate_attestations gate`);
        expect(migration).not.toContain(`FROM ${CONTROL_SCHEMA}.gate_attestations gate`);
        continue;
      }
      const gate = POST_PHASE_GATES[entry.ordinal - 52];
      for (const payload of [attempt, migration]) {
        expect(payload).toContain(`OR NOT EXISTS (`);
        expect(payload).toContain(`FROM ${CONTROL_SCHEMA}.gate_attestations gate`);
        expect(payload).toContain(`gate.target_ordinal = ${entry.ordinal}`);
        expect(payload).toContain(`gate.target_version = '${entry.version}'`);
        expect(payload).toContain(`gate.previous_ordinal = ${entry.ordinal - 1}`);
        expect(payload).toContain(`gate.previous_version = '${gate.previousVersion}'`);
        expect(payload).toContain(`gate.attestation = '${gate.attestation}'`);
      }
    }
  });

  it("generates one atomic guarded payload for every canonical migration", () => {
    for (const entry of manifest.entries) {
      const payload = buildMigrationPayload(configFor(entry), manifest);
      const payloadAgain = buildMigrationPayload(configFor(entry), manifest);
      expect(payloadAgain).toBe(payload);
      expect(payload).toContain("campuscoach:lovable-staging-migration");
      expect(payload).toContain("lovable staging migration guard mismatch");
      expect(payload).toContain("lovable staging migration receipt mismatch");
      expect(payload).toContain(`WHERE ordinal = ${entry.ordinal};`);
      expect(payload).toContain(`v_manifest.version <> '${entry.version}'`);
      expect(payload).toContain(`v_manifest.file_sha256 <> '${entry.fileSha256}'`);
      expect(payload).toContain(`v_manifest.git_blob_sha1 <> '${entry.gitBlobSha1}'`);
      expect(payload).toContain(`v_state.current_ordinal <> ${entry.ordinal - 1}`);
      expect(payload).toContain(ATTEMPT_NONCE);
      const sourceAnalysis = analyzeMigrationSql(entry.sql);
      const canonicalBody = sourceAnalysis.hasOuterTransaction
        ? entry.sql.slice(sourceAnalysis.beginInsertion!, sourceAnalysis.commitInsertion!).trim()
        : entry.sql.trim();
      expect(payload).toContain(canonicalBody.slice(0, 30));

      const generatedAnalysis = analyzeMigrationSql(payload);
      expect(generatedAnalysis.hasOuterTransaction).toBe(true);
      expect(generatedAnalysis.statements[0].words).toEqual(["begin"]);
      expect(generatedAnalysis.statements.at(-1)?.words).toEqual(["commit"]);
    }
  });

  it("injects guards inside existing wrappers without nesting transactions", () => {
    for (const filename of EXPECTED_OUTER_TRANSACTION_FILES) {
      const entry = manifest.entries.find((candidate) => candidate.filename === filename);
      expect(entry).toBeDefined();
      const sourceAnalysis = analyzeMigrationSql(entry!.sql);
      const payload = buildMigrationPayload(configFor(entry!), manifest);
      const payloadAnalysis = analyzeMigrationSql(payload);
      expect(sourceAnalysis.hasOuterTransaction).toBe(true);
      expect(payloadAnalysis.hasOuterTransaction).toBe(true);
      expect(payloadAnalysis.statements.filter(({ words }) => words[0] === "begin")).toHaveLength(1);
      expect(payloadAnalysis.statements.filter(({ words }) => words[0] === "commit")).toHaveLength(1);
      expect(payload.indexOf("SET LOCAL lock_timeout")).toBeLessThan(
        payload.indexOf(entry!.sql.slice(sourceAnalysis.beginInsertion!, sourceAnalysis.beginInsertion! + 30)),
      );
      expect(payload.indexOf("$cc_staging_receipt$;")).toBeLessThan(
        payload.toLowerCase().lastIndexOf("commit;"),
      );
    }
  });

  it("wraps ordinary migrations and preserves their canonical bytes contiguously", () => {
    for (const entry of manifest.entries.filter(({ hasOuterTransaction }) => !hasOuterTransaction)) {
      const payload = buildMigrationPayload(configFor(entry), manifest);
      expect(payload.startsWith("BEGIN;\nSET LOCAL")).toBe(true);
      expect(payload).toContain(entry.sql);
      expect(payload.endsWith("COMMIT;")).toBe(true);
    }
  });

  it("requires ordinal and version to select the same single migration", () => {
    const first = manifest.entries[0];
    expect(selectMigration(manifest, first.ordinal, first.version)).toBe(first);
    expect(() => selectMigration(manifest, first.ordinal, manifest.entries[1].version))
      .toThrow("ordinal and version do not identify the same canonical migration");
    expect(() => selectMigration(manifest, 0, first.version)).toThrow("exactly one migration");
    expect(() => buildMigrationPayload({
      ...configFor(first),
      attemptNonce: undefined,
    }, manifest)).toThrow("attemptNonce");
  });

  it("rejects psql meta commands and malformed transaction boundaries", () => {
    const rejected = [
      "\\set target staging\nselect 1;",
      "select 1; commit;",
      "begin; select 1; commit; select 2;",
      "begin; savepoint unsafe; select 1; commit;",
      "begin; select 1; rollback;",
      "select 1",
    ];
    for (const sql of rejected) expect(() => analyzeMigrationSql(sql)).toThrow(LovableStagingPayloadFailure);
  });

  it("rejects reviewed nontransactional hazards", () => {
    const rejected = [
      "vacuum public.captures;",
      "create index concurrently captures_idx on public.captures(id);",
      "create unique index concurrently captures_idx on public.captures(id);",
      "drop index concurrently captures_idx;",
      "reindex index concurrently captures_idx;",
      "refresh materialized view concurrently public.summary;",
      "alter type public.stage add value 'new';",
      "create database forbidden;",
    ];
    for (const sql of rejected) expect(() => analyzeMigrationSql(sql)).toThrow("transaction-safety");
  });

  it("rejects unparenthesized CASE expressions in PL/pgSQL conditions", () => {
    const rejected = [
      `
        do $body$
        begin
          if true or case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
      `
        do $body$
        begin
          if false then
            null;
          elseif case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
      `
        do $body$
        begin
          if true and /* an ignored comment */
             case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
      `
        do $body$
        begin
          if case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
      `
        do $body$
        begin
          if not -- comment between the guarded tokens
             case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
      `
        do $body$
        begin
          if false then
            null;
          elsif /* comment before the expression */
            case when true then false else true end then
            null;
          end if;
        end;
        $body$;
      `,
    ];
    for (const sql of rejected) {
      expect(() => analyzeMigrationSql(sql)).toThrow("postgres-parse-ambiguity");
    }

    expect(() => analyzeMigrationSql(`
      do $body$
      begin
        if true or /* allowed before an explicit parenthesis */
           (case when true then false else true end) then
          null;
        end if;
      end;
      $body$;
    `)).not.toThrow();

    expect(() => analyzeMigrationSql(`
      do $body$
      begin
        if not (case when true then false else true end) then
          null;
        elsif coalesce(case when true then false else true end, false) then
          null;
        end if;
      end;
      $body$;
    `)).not.toThrow();
  });

  it("scopes the CASE guard to PL/pgSQL bodies and ignores lexical lookalikes", () => {
    const allowed = [
      "select true or case when true then false else true end;",
      "select $text$ top-level OR CASE text $text$;",
      `
        create function public.sql_case()
        returns boolean language sql as $sql$
          select true and case when true then false else true end
        $sql$;
      `,
      `
        create function public.plpgsql_return_case()
        returns boolean language plpgsql as $function$
        begin
          -- RETURN is parsed as a normal SQL expression, unlike IF's read-until-THEN condition.
          return true or case when true then false else true end;
        end;
        $function$;
      `,
      `
        do $body$
        begin
          -- OR CASE in a comment is not executable syntax.
          perform 'AND CASE in a string';
          perform "OR CASE in a quoted identifier";
          perform $nested$OR CASE in nested dollar text$nested$;
          perform true or (/* comment */ case when true then false else true end);
          alter table public.example
            add column if not exists ready boolean default case when true then false else true end;
          if true then
            null;
          end if;
          case when true then
            null;
          else
            null;
          end case;
        end;
        $body$;
      `,
    ];
    for (const sql of allowed) expect(() => analyzeMigrationSql(sql)).not.toThrow();
  });

  it("keeps the full-scope trigger on scalar artifact identity plus a locked row fetch", () => {
    const migration = manifest.entries.find(({ version }) => version === "20260828110000")?.sql;
    expect(migration).toBeDefined();
    expect(migration).not.toMatch(
      /select\s+attempt\.evidence_contract_version\s*,\s*artifact\s+into\s+v_contract_version\s*,\s*v_artifact/iu,
    );
    expect(migration).toMatch(
      /select\s+attempt\.evidence_contract_version\s*,\s*artifact\.id\s+into\s+v_contract_version\s*,\s*v_artifact_id[\s\S]*?for\s+share\s+of\s+attempt\s*,\s*artifact\s*;/iu,
    );
    expect(migration).toMatch(
      /select\s+artifact\.\*\s+into\s+strict\s+v_artifact\s+from\s+public\.learning_artifacts\s+artifact\s+where\s+artifact\.id\s*=\s*v_artifact_id\s+and\s+artifact\.user_id\s*=\s*new\.user_id\s*;/iu,
    );
  });

  it("ignores transaction-looking text inside comments, strings, identifiers, and dollar quotes", () => {
    const sql = `
      -- COMMIT; \\set ignored
      create function public.safe_test()
      returns text language plpgsql as $body$
      begin
        return 'COMMIT; ROLLBACK;';
      end;
      $body$;
      select 'BEGIN; COMMIT;', "ROLLBACK";
      /* nested BEGIN; /* COMMIT; */ ROLLBACK; */
    `;
    const analysis = analyzeMigrationSql(sql);
    expect(analysis.hasOuterTransaction).toBe(false);
    expect(analysis.statements).toHaveLength(2);
    expect(scanTopLevelSql(sql).map(({ words }) => words[0])).toEqual(["create", "select"]);
  });

  it("fails closed on invalid identities and unterminated lexical regions", () => {
    const entry = manifest.entries[0];
    expect(() => buildAttemptPayload({
      ...configFor(entry),
      projectId: "not-a-project",
    }, manifest)).toThrow("projectId");
    expect(() => buildAttemptPayload({
      ...configFor(entry),
      candidateSha: "abc",
    }, manifest)).toThrow("candidateSha");
    expect(() => analyzeMigrationSql("select 'unterminated;"))
      .toThrow("unterminated string literal");
    expect(() => analyzeMigrationSql("select /* unterminated;"))
      .toThrow("unterminated block comment");
    expect(() => analyzeMigrationSql("do $tag$ begin;"))
      .toThrow("unterminated dollar quote");
  });
});
