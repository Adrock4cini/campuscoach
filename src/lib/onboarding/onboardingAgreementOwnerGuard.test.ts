import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260827140000_onboarding_agreement_owner_guard.sql";
const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  resolve(migrationDirectory, migrationName),
  "utf8",
);
const sql = migration.toLowerCase();
const syllabusCommitSql = readFileSync(
  resolve(migrationDirectory, "20260810120000_class_owned_syllabi.sql"),
  "utf8",
).toLowerCase();
const memoryFeedbackSql = readFileSync(
  resolve(migrationDirectory, "20260817190000_study_intelligence_v1.sql"),
  "utf8",
).toLowerCase();
const pauseGuardSql = readFileSync(
  resolve(migrationDirectory, "20260827125500_study_write_maintenance_guard.sql"),
  "utf8",
).toLowerCase();
const artifactValidationSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/artifact-validation.ts"),
  "utf8",
);
const canonicalMnemonicTechniques = [
  ...artifactValidationSource.matchAll(/\{ id: "([a-z_]+)", use:/g),
].map((match) => match[1]);
const migrationHistory = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(migrationDirectory, name), "utf8"))
  .join("\n")
  .toLowerCase();
const rollout = readFileSync(
  resolve(process.cwd(), "docs/study-intelligence-rollout.md"),
  "utf8",
).toLowerCase();
const operations = readFileSync(
  resolve(process.cwd(), "docs/family-beta-operations.md"),
  "utf8",
).toLowerCase();
const qaChecklist = readFileSync(
  resolve(process.cwd(), "docs/qa-checklist.md"),
  "utf8",
).toLowerCase();
const classChildTables = [
  "enrollments",
  "assignments",
  "exams",
  "flashcards",
  "quizzes",
  "study_sessions",
  "readiness_scores",
  "class_syllabus_requests",
] as const;
const clientClassChildTables = classChildTables.filter(
  (table) => table !== "enrollments",
);
const browserForbiddenLegacyTables = [
  "flashcards",
  "quizzes",
  "readiness_scores",
] as const;
const expectedBrowserDefinerSignatures = [
  "accept_family_beta_agreement(text)",
  "can_delete_uncommitted_capture_source(text)",
  "can_upload_capture_source(text)",
  "can_upload_uncommitted_syllabus_source(text)",
  "commit_class_syllabus(uuid,text,uuid,text,text,text,bigint,text,jsonb,jsonb)",
  "get_family_beta_agreement_status()",
  "get_learning_evidence_contract_status()",
  "has_current_family_beta_agreement()",
  "owns_active_syllabus_storage_path(text)",
  "owns_syllabus_storage_path(text)",
  "record_memory_trick_feedback(uuid,uuid,text,boolean)",
  "study_writes_are_available()",
] as const;

describe("onboarding agreement and owner boundary migration", () => {
  it("installs all onboarding guards atomically after the prior launch repair", () => {
    expect(migrationName).toMatch(/^20260827140000_/);
    expect(sql).toMatch(/^--[\s\S]*\nbegin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });

  it("locks every row-trigger surface through the atomic handoff", () => {
    const lockBlock = sql.match(
      /lock table([\s\S]+?)in share row exclusive mode;/,
    )?.[1];
    expect(lockBlock).toBeDefined();
    for (const table of [
      "schools",
      "profiles",
      "classes",
      "class_syllabi",
      "class_syllabus_requests",
      "enrollments",
      "assignments",
      "exams",
      "flashcards",
      "quizzes",
      "study_sessions",
      "readiness_scores",
      "study_memory_feedback",
    ]) {
      expect(lockBlock).toContain(`public.${table}`);
    }
    expect(sql).toContain("in share row exclusive mode");
  });

  it.each(["profiles", "classes", "enrollments", "assignments", "exams"])(
    "requires the current durable agreement for authenticated %s inserts and updates",
    (table) => {
      expect(sql).toContain(`${table}_current_agreement_insert`);
      expect(sql).toContain(`on public.${table} as restrictive for insert to authenticated`);
      expect(sql).toContain(`${table}_current_agreement_update`);
      expect(sql).toContain(`on public.${table} as restrictive for update to authenticated`);
    },
  );

  it("requires the current agreement before an authenticated user can add a shared school", () => {
    expect(sql).toContain("schools_current_agreement_insert");
    expect(sql).toContain("on public.schools as restrictive for insert to authenticated");
    expect(sql).toContain("with check (public.has_current_family_beta_agreement())");
  });

  it("composes the school guard with the existing permissive branch without granting anon writes", () => {
    expect(migrationHistory).toContain(
      'create policy "anyone can add schools (mvp)" on public.schools for insert with check (true)',
    );
    expect(
      migrationHistory.match(
        /grant\s+[^;]+?\s+on(?:\s+table)?\s+public\.schools\s+to\s+[^;]*\banon\b[^;]*;/g,
      ),
    ).toEqual(["grant select on public.schools to anon;"]);
  });

  it("keeps every owner-scoped policy bound to auth.uid and the durable receipt", () => {
    const ownerAgreementChecks = sql.match(
      /user_id = auth\.uid\(\)\s+and public\.has_current_family_beta_agreement\(\)/g,
    );
    expect(ownerAgreementChecks).toHaveLength(18);
    expect(sql).not.toMatch(/current_agreement_delete/);
    expect(sql).not.toMatch(/for delete to authenticated/);
  });

  it("enforces agreement and the lock-coordinated pause behind direct-table RLS", () => {
    expect(sql).toContain(
      "create or replace function public.enforce_family_beta_write_boundary()",
    );
    expect(sql).toContain("if not public.has_current_family_beta_agreement() then");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain("if not public.study_writes_are_available() then");
    expect(sql).toContain("errcode = '55000'");
    expect(sql).toContain("message = 'study_writes_paused'");
    expect(pauseGuardSql).toMatch(
      /create or replace function public\.study_writes_are_available\(\)[\s\S]+?for share;/,
    );
    expect(pauseGuardSql).toContain("return not coalesce(v_paused, true)");

    for (const table of [
      "profiles",
      "classes",
      "enrollments",
      "assignments",
      "exams",
      "study_sessions",
    ]) {
      expect(sql).toContain(`create trigger ${table}_enforce_current_agreement_write`);
      expect(sql).toContain(
        `create trigger ${table}_enforce_current_agreement_write\nbefore insert or update\non public.${table}`,
      );
    }
    expect(sql).toContain(
      "create trigger schools_enforce_current_agreement_write\nbefore insert\non public.schools",
    );
    for (const operation of ["insert", "update"] as const) {
      expect(sql).toContain(`study_sessions_current_agreement_${operation}`);
      expect(sql).toContain(
        `on public.study_sessions as restrictive for ${operation} to authenticated`,
      );
    }
    const studyPolicyBlock = sql.match(
      /drop policy if exists study_sessions_current_agreement_insert([\s\S]+?)drop policy if exists schools_current_agreement_insert/,
    )?.[1];
    expect(studyPolicyBlock).toContain("public.has_current_family_beta_agreement()");
    expect(studyPolicyBlock).toContain("public.study_writes_are_available()");
  });

  it("closes the authenticated SECURITY DEFINER syllabus-commit bypass", () => {
    expect(syllabusCommitSql).toContain("create or replace function public.commit_class_syllabus(");
    expect(syllabusCommitSql).toMatch(
      /commit_class_syllabus\([\s\S]+?security definer[\s\S]+?update public\.classes/,
    );
    expect(syllabusCommitSql).toContain("insert into public.assignments");
    expect(syllabusCommitSql).toContain("insert into public.exams");
    expect(syllabusCommitSql).toMatch(
      /grant execute on function public\.commit_class_syllabus\([\s\S]+?\) to authenticated, service_role;/,
    );

    for (const table of ["class_syllabi", "class_syllabus_requests"]) {
      expect(sql).toContain(`create trigger ${table}_enforce_current_agreement_write`);
      expect(sql).toContain(
        `create trigger ${table}_enforce_current_agreement_write\nbefore insert or update\non public.${table}`,
      );
    }
  });

  it("guards the authenticated SECURITY DEFINER memory-feedback upsert", () => {
    expect(memoryFeedbackSql).toContain(
      "create or replace function public.record_memory_trick_feedback(",
    );
    expect(memoryFeedbackSql).toMatch(
      /record_memory_trick_feedback\([\s\S]+?security definer[\s\S]+?insert into public\.study_memory_feedback/,
    );
    expect(memoryFeedbackSql).toMatch(
      /grant execute on function public\.record_memory_trick_feedback\([\s\S]+?\)\s+to authenticated, service_role;/,
    );
    expect(sql).toContain(
      "create or replace function public.record_memory_trick_feedback(",
    );
    expect(sql).toContain("artifact.user_id = v_user_id");
    expect(sql).toContain("concept.user_id = v_user_id");
    expect(sql).toContain("item ->> 'technique' = p_technique");
    expect(sql).toContain(
      "create trigger study_memory_feedback_enforce_current_agreement_write\nbefore insert or update\non public.study_memory_feedback",
    );
  });

  it("keeps the feedback constraint and RPC aligned with the canonical 16-technique catalog", () => {
    expect(canonicalMnemonicTechniques).toHaveLength(16);
    expect(new Set(canonicalMnemonicTechniques).size).toBe(16);

    const constraintList = sql.match(
      /add constraint study_memory_feedback_technique_check check \(\s*technique in \(([\s\S]+?)\)\s*\);/,
    )?.[1];
    const rpcList = sql.match(
      /if p_technique not in \(([\s\S]+?)\) then/,
    )?.[1];
    expect(constraintList).toBeDefined();
    expect(rpcList).toBeDefined();

    const readSqlList = (value: string | undefined) => [
      ...(value ?? "").matchAll(/'([a-z_]+)'/g),
    ].map((match) => match[1]);
    expect(readSqlList(constraintList)).toEqual(canonicalMnemonicTechniques);
    expect(readSqlList(rpcList)).toEqual(canonicalMnemonicTechniques);
  });

  it("trusts only service-key or direct operator roles, never a null anonymous subject", () => {
    const boundaryBody = sql.match(
      /create or replace function public\.enforce_family_beta_write_boundary\(\)[\s\S]+?as \$\$([\s\S]+?)\$\$;/,
    )?.[1];
    expect(boundaryBody).toBeDefined();
    expect(boundaryBody).toContain("v_jwt_role text := nullif(auth.role(), '')");
    expect(boundaryBody).toContain("v_session_role text := session_user");
    expect(boundaryBody).toContain("v_jwt_role = 'service_role'");
    expect(boundaryBody).toContain(
      "v_session_role in ('postgres', 'supabase_admin', 'service_role')",
    );
    expect(boundaryBody).not.toMatch(/if\s+auth\.uid\(\)\s+is\s+null\s+then\s+return new/);
    expect(sql).toContain(
      "security definer makes current_user the function\n-- owner",
    );

    const trusted = boundaryBody?.indexOf("if v_jwt_role = 'service_role'") ?? -1;
    const agreement = boundaryBody?.indexOf(
      "if not public.has_current_family_beta_agreement() then",
    ) ?? -1;
    const pause = boundaryBody?.indexOf(
      "if not public.study_writes_are_available() then",
    ) ?? -1;
    expect(trusted).toBeGreaterThan(-1);
    expect(trusted).toBeLessThan(agreement);
    expect(agreement).toBeLessThan(pause);
    expect(sql).not.toMatch(/before delete[\s\S]{0,80}enforce_family_beta_write_boundary/);
    expect(sql).not.toMatch(/after delete[\s\S]{0,80}enforce_family_beta_write_boundary/);
    expect(sql).not.toContain("on public.family_beta_agreement_acceptances");
  });

  it("admits only the real FK SET NULL row shape during a nested class delete", () => {
    expect(sql).toContain("pg_catalog.pg_trigger_depth() > 1");
    for (const table of [
      "assignments",
      "exams",
      "flashcards",
      "quizzes",
      "study_sessions",
    ]) {
      expect(sql).toMatch(
        new RegExp(`tg_table_name in \\([\\s\\S]+?'${table}'`),
      );
    }
    expect(sql).toContain("pg_catalog.to_jsonb(new)->>'class_id' is null");
    expect(sql).toContain("(pg_catalog.to_jsonb(new) - 'class_id')");
    expect(sql).toContain("(pg_catalog.to_jsonb(old) - 'class_id')");
    expect(sql).toMatch(
      /not exists \(\s+select 1\s+from public\.classes roster_class/,
    );
    expect(sql).toContain(
      "revoke all on function public.enforce_family_beta_write_boundary()\n  from public, anon, authenticated, service_role",
    );
  });

  it("fails closed on every existing class owner/client identity mismatch", () => {
    const preflightTables = sql.match(
      /foreach v_child_table in array array\[([\s\S]+?)\]\s+loop/,
    )?.[1];
    expect(preflightTables).toBeDefined();
    const listedTables = [...(preflightTables ?? "").matchAll(/'([a-z_]+)'/g)]
      .map((match) => match[1]);
    expect(listedTables).toEqual(classChildTables);
    expect(sql).toContain("roster_class.user_id is distinct from child.user_id");
    expect(sql).toContain(
      "roster_class.client_class_id is distinct from\n                  pg_catalog.to_jsonb(child)->>'client_class_id'",
    );
    expect(sql).toContain(
      "contains an invalid owner/class/client identity",
    );
  });

  it("enforces same owner and client class identity for browser and service-role writes", () => {
    expect(sql).toContain("create or replace function public.enforce_owned_class_reference()");
    expect(sql).toContain("security definer\nset search_path = ''");
    expect(sql).toContain("roster_class.user_id = new.user_id");
    expect(sql).toContain(
      "roster_class.client_class_id is not distinct from",
    );
    expect(sql).toContain("for key share");
    expect(sql).toContain(
      "before insert or update of user_id, class_id\non public.enrollments",
    );
    for (const table of clientClassChildTables) {
      expect(sql).toContain(`${table}_enforce_owned_class`);
      expect(sql).toContain(
        `before insert or update of user_id, class_id, client_class_id\non public.${table}`,
      );
    }
  });

  it("binds every syllabus request result to the same owner, class, and client identity", () => {
    expect(sql).toContain(
      "class_syllabus_requests contains a mismatched syllabus identity",
    );
    expect(sql).toContain(
      "create or replace function public.enforce_syllabus_request_reference()",
    );
    for (const equality of [
      "syllabus.user_id = new.user_id",
      "syllabus.class_id = new.class_id",
      "syllabus.client_class_id = new.client_class_id",
    ]) {
      expect(sql).toContain(equality);
    }
    expect(sql).toContain(
      "before insert or update of user_id, class_id, client_class_id, syllabus_id\non public.class_syllabus_requests",
    );
    expect(sql).toContain(
      "revoke all on function public.enforce_syllabus_request_reference()\n  from public, anon, authenticated, service_role",
    );
  });

  it("forbids browser writes to unused v0 artifacts while retaining history reads and service work", () => {
    for (const table of browserForbiddenLegacyTables) {
      expect(sql).toContain(
        `revoke insert, update, delete on table public.${table}\n  from anon, authenticated`,
      );
      expect(sql).not.toContain(`revoke select on table public.${table}`);
      expect(migrationHistory).toContain(
        `grant all on public.${table} to service_role`,
      );
    }
    for (const policy of [
      "flashcards_owner_insert",
      "flashcards_owner_update",
      "flashcards_owner_delete",
      "quizzes_owner_insert",
      "quizzes_owner_update",
      "quizzes_owner_delete",
      "readiness_owner_insert",
      "readiness_owner_update",
      "readiness_owner_delete",
    ]) {
      expect(sql).toContain(`drop policy if exists ${policy}`);
    }
    expect(sql).toContain(
      "revoke insert, update, delete on table public.study_sessions from anon",
    );
    expect(migrationHistory).toContain(
      'create policy "sessions_owner_delete" on public.study_sessions',
    );
  });

  it("keeps class ownership immutable and trigger helpers non-callable by clients", () => {
    expect(sql).toContain("create or replace function public.prevent_class_owner_reassignment()");
    expect(sql).toContain("new.user_id is distinct from old.user_id");
    expect(sql).toContain(
      "new.client_class_id is distinct from old.client_class_id",
    );
    expect(sql).toContain("message = 'class client identity is immutable'");
    expect(sql).toContain(
      "before update of user_id, client_class_id\non public.classes",
    );
    for (const helper of [
      "enforce_owned_class_reference()",
      "enforce_syllabus_request_reference()",
      "prevent_class_owner_reassignment()",
      "enforce_family_beta_write_boundary()",
    ]) {
      expect(sql).toContain(
        `revoke all on function public.${helper}\n  from public, anon, authenticated, service_role`,
      );
    }
  });

  it("keeps the final paused handoff ordered through every launch repair", () => {
    const finalHandoff = rollout.split("### final resume and public canary")[1];
    expect(finalHandoff).toBeDefined();

    const versions = [
      "20260827133000_browser_learning_evidence_write_guard.sql",
      "20260827134000_class_client_identity_owner_scope.sql",
      "20260827135000_launch_schema_regression_guard.sql",
      migrationName,
    ];
    const positions = versions.map((version) => finalHandoff.indexOf(version));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(finalHandoff.indexOf("set_study_writes_paused(false, null)")).toBeGreaterThan(
      positions.at(-1) ?? -1,
    );
  });

  it("documents the hosted agreement and two-owner canaries before resume", () => {
    for (const document of [rollout, operations, qaChecklist]) {
      expect(document).toContain("20260827140000");
      expect(document).toMatch(/accepted[\s-]+(?:staging )?(?:user|identit)/);
      expect(document).toMatch(/cross-owner|other identity|cross-student/);
      expect(document).toContain("commit_class_syllabus");
      expect(document).toContain("42501");
      expect(document).toContain("record_memory_trick_feedback");
      expect(document).toContain("55000");
      expect(document).toContain("study session");
      for (const table of browserForbiddenLegacyTables) {
        expect(document).toContain(table);
      }
      expect(document).toContain("enrollment");
      expect(document).toContain("client_class_id");
      expect(document).toContain("syllabus_id");
      expect(document).toContain("prosecdef = false");
      expect(document).toMatch(/zero anon|anon_execute = false/);
    }
    for (const signature of expectedBrowserDefinerSignatures) {
      expect(operations).toContain(`('${signature}')`);
      expect(rollout).toContain(`\`${signature}\``);
    }
    expect(operations).toContain("full outer join actual using (signature)");
    expect(operations).toContain(
      "pg_catalog.replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',')",
    );
    expect(operations).toContain("has_function_privilege('anon', p.oid, 'execute')");
    expect(operations).toContain(
      "has_function_privilege('authenticated', p.oid, 'execute')",
    );
    expect(operations).toContain("exactly 12 rows");
    expect(qaChecklist).toContain("exactly 12 rows");
    expect(rollout).toContain("six guarded study-write edge entry points");
    expect(rollout).not.toContain("bundle-check the five study-write edge entry points");
  });
});
