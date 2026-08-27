import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260827124000_course_map_stable_guard.sql";
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations",
  migrationName,
), "utf8");

function between(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start: ${start}`).toBeGreaterThan(-1);
  expect(endIndex, `missing end: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("stable Course Map database boundary", () => {
  it("reserves both the stable source kind and identity namespace", () => {
    expect(migration).toContain("new.source_kind = 'course-map-stable'");
    expect(migration).toContain("new.identity_key like 'course-map:%'");
    expect(migration).toContain("old.source_kind = 'course-map-stable'");
    expect(migration).toContain("old.identity_key like 'course-map:%'");
    expect(migration).toContain(
      "new.identity_key !~ '^course-map:acct-2010:v0:unit-(0[1-9]|1[0-5])$'",
    );
    expect(migration).toContain("before insert or update or delete on public.concepts");
  });

  it("requires the complete stable-only persisted row shape", () => {
    const trigger = between(
      "create or replace function public.protect_stable_course_map_concept()",
      "drop trigger if exists concepts_protect_stable_course_map",
    );

    expect(trigger).toContain("new.capture_id is not null");
    expect(trigger).toContain("new.retired_at is not null");
    expect(trigger).toContain("new.embedding is not null");
    expect(trigger).toContain("new.professor_emphasis");
    expect(trigger).toContain("cardinality(new.examples) <> 0");
    expect(trigger).toContain("(select count(*) from jsonb_object_keys(new.meta)) <> 3");
    expect(trigger).toContain("array['courseMapVersion', 'unitId', 'topicAliases']");
    expect(trigger).toContain("'acct-2010-learning-map-v0'");
    expect(trigger).toContain("acct-2010-unit-%s");
    expect(trigger).toContain("for share;");
    expect(trigger).not.toContain("contentPolicy");
    expect(trigger).not.toContain("authority");
    expect(trigger).not.toContain("knowledgeLayer");
  });

  it("makes stable truth immutable even to direct service updates", () => {
    const trigger = between(
      "create or replace function public.protect_stable_course_map_concept()",
      "drop trigger if exists concepts_protect_stable_course_map",
    );
    const immutability = trigger.slice(trigger.indexOf("if tg_op = 'UPDATE' then"));

    for (const field of [
      "id", "user_id", "class_id", "client_class_id", "capture_id",
      "identity_key", "name", "slug", "definition", "examples",
      "professor_emphasis", "source_kind", "meta", "created_at", "retired_at",
    ]) {
      expect(immutability).toContain(`old.${field} is distinct from new.${field}`);
    }
    expect(immutability).toContain("(old.embedding is null) is distinct from (new.embedding is null)");
    expect(immutability).toContain("new.updated_at := clock_timestamp()");
    expect(immutability).not.toContain("v_role <> 'service_role'");
    expect(trigger).toContain("stable course-map concepts are immutable");
  });

  it("allows nested ownership cascades but rejects direct stable deletion or reassignment", () => {
    expect(migration).toContain(
      "if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then",
    );
    expect(migration).not.toContain("if pg_catalog.pg_trigger_depth() > 1 then");
    expect(migration).toContain("stable course-map identities cannot be reassigned");
    expect(migration).toContain("if tg_op = 'DELETE' then");
    expect(migration).toContain("return old;");
  });

  it("defines a service-only atomic ensure RPC and locks the class before validation", () => {
    const rpc = between(
      "create or replace function public.ensure_acct_2010_map_concepts(",
      "revoke all on function public.protect_stable_course_map_concept()",
    );

    expect(rpc).toContain("returns setof public.concepts");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("where owned_class.id = p_class_id\n  for update;");
    expect(rpc).toContain("v_class.user_id is distinct from p_user_id");
    expect(rpc).toContain("v_class.client_class_id is distinct from p_client_class_id");
    expect(rpc).toContain("v_class.source_archived_at is not null");
    expect(rpc).toContain("ACCT 2010 map requires an owned active literal ACCT 2010 class");
    expect(rpc).toContain("v_class.meta ->> 'code'");
    expect(rpc).toContain("v_class.meta -> 'canvas' ->> 'courseCode'");
    expect(migration).toContain(
      "revoke all on function public.ensure_acct_2010_map_concepts(uuid, uuid, text, jsonb)",
    );
    expect(migration).toContain(
      "grant execute on function public.ensure_acct_2010_map_concepts(uuid, uuid, text, jsonb)\n  to service_role",
    );
  });

  it("accepts exactly the runtime's 15 ordered stable seed objects", () => {
    const rpc = between(
      "create or replace function public.ensure_acct_2010_map_concepts(",
      "revoke all on function public.protect_stable_course_map_concept()",
    );

    expect(rpc).toContain("jsonb_array_length(p_seeds) <> 15");
    expect(rpc).toContain("(select count(*) from jsonb_object_keys(v_seed)) <> 7");
    for (const key of [
      "identityKey", "name", "definition", "examples",
      "professorEmphasis", "sourceKind", "metadata",
    ]) {
      expect(rpc).toContain(`'${key}'`);
    }
    expect(rpc).toContain("jsonb_array_length(v_seed -> 'examples') <> 0");
    expect(rpc).toContain(
      "(v_seed -> 'professorEmphasis') is distinct from ('false'::jsonb)",
    );
    expect(rpc).toContain("v_seed ->> 'sourceKind' is distinct from 'course-map-stable'");
    expect(rpc).toContain("(select count(*) from jsonb_object_keys(v_metadata)) <> 3");
    expect(rpc).toContain("array['courseMapVersion', 'unitId', 'topicAliases']");
    expect(rpc).toContain("v_unit_id <> v_position");
    expect(rpc).toContain("course-map:acct-2010:v0:unit-%s");
    expect(rpc).toContain("lpad(v_unit_id::text, 2, '0')");
    expect(rpc).not.toContain("contentPolicy");
    expect(rpc).not.toContain("authority");
    expect(rpc).not.toContain("knowledgeLayer");
  });

  it("inserts idempotently, rejects drift, returns exactly 15 ordered rows, and creates no mastery", () => {
    const rpc = between(
      "create or replace function public.ensure_acct_2010_map_concepts(",
      "revoke all on function public.protect_stable_course_map_concept()",
    );

    expect(rpc).toContain("on conflict (user_id, class_id, identity_key) do nothing");
    expect(rpc).toContain("format('acct-2010-unit-%s', lpad(seed_item.ordinality::text, 2, '0'))");
    expect(rpc).toContain("array[]::text[]");
    expect(rpc).toContain("and concept.meta = seed_item.value -> 'metadata'");
    expect(rpc).toContain("if v_matching_rows <> 15 then");
    expect(rpc).toContain("ACCT 2010 stable concept identity was preempted or changed");
    expect(rpc).toContain("return query");
    expect(rpc).toContain("order by (concept.meta ->> 'unitId')::integer");
    expect(rpc).not.toContain("insert into public.user_concept_mastery");
    expect(rpc).not.toContain("update public.user_concept_mastery");
  });

  it("lands in the additive phase before the locked review RPC", () => {
    const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(migrations.indexOf(migrationName)).toBeGreaterThan(
      migrations.indexOf("20260827122500_study_write_pause_control.sql"),
    );
    expect(migrations.indexOf(migrationName)).toBeLessThan(
      migrations.indexOf("20260827125000_assignment_review_artifact_guard.sql"),
    );
  });
});
