-- Stable Course Map concepts are original Campus Companion teaching truth.
-- Students may opt a class into a map, but browser writes must not preempt the
-- reserved identity namespace or edit the stable copy after the server creates
-- it. Mastery remains absent until a student produces real learning evidence.

create or replace function public.protect_stable_course_map_concept()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_context boolean := false;
  v_old_reserved boolean := false;
  v_new_reserved boolean := false;
  v_unit_id integer;
  v_expected_identity text;
  v_expected_slug text;
  v_course_pattern constant text := '(^|[^A-Z0-9])ACCT([[:space:]]|-)*2010($|[^A-Z0-9])';
begin
  -- Allow only a real nested ownership DELETE cascade. Nested INSERT/UPDATE
  -- paths still pass through the complete shape and immutability checks.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  v_service_context := v_role = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');

  if tg_op = 'INSERT' then
    v_new_reserved := coalesce(new.source_kind = 'course-map-stable', false)
      or coalesce(new.identity_key like 'course-map:%', false);
  elsif tg_op = 'UPDATE' then
    v_old_reserved := coalesce(old.source_kind = 'course-map-stable', false)
      or coalesce(old.identity_key like 'course-map:%', false);
    v_new_reserved := coalesce(new.source_kind = 'course-map-stable', false)
      or coalesce(new.identity_key like 'course-map:%', false);
  else
    v_old_reserved := coalesce(old.source_kind = 'course-map-stable', false)
      or coalesce(old.identity_key like 'course-map:%', false);
  end if;

  if not v_old_reserved and not v_new_reserved then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'stable course-map concepts are immutable';
  end if;

  -- A normal concept can never be promoted into the reserved namespace, and
  -- stable truth can never be demoted out of it. The atomic ensure RPC creates
  -- stable rows with INSERT ... ON CONFLICT DO NOTHING instead.
  if tg_op = 'UPDATE' and (not v_old_reserved or not v_new_reserved) then
    raise exception using
      errcode = '42501',
      message = 'stable course-map identities cannot be reassigned';
  end if;

  if tg_op = 'INSERT' and not v_service_context then
    raise exception using
      errcode = '42501',
      message = 'stable course-map concepts are server-owned';
  end if;

  -- Every reserved row has one canonical ACCT 2010 v0 identity and shape.
  -- Unknown maps require a later reviewed migration instead of quietly
  -- entering this namespace through a direct service write.
  if new.source_kind is distinct from 'course-map-stable'
      or new.identity_key is null
      or new.identity_key !~ '^course-map:acct-2010:v0:unit-(0[1-9]|1[0-5])$'
      or new.user_id is null
      or new.class_id is null
      or new.client_class_id is null
      or btrim(new.client_class_id) = ''
      or new.capture_id is not null
      or new.retired_at is not null
      or new.embedding is not null
      or new.professor_emphasis
      or cardinality(new.examples) <> 0
      or btrim(new.name) = ''
      or btrim(new.name) is distinct from new.name
      or new.definition is null
      or btrim(new.definition) = ''
      or btrim(new.definition) is distinct from new.definition then
    raise exception using
      errcode = '23514',
      message = 'invalid stable ACCT 2010 concept shape';
  end if;

  if jsonb_typeof(new.meta) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      message = 'stable ACCT 2010 metadata must be an object';
  end if;
  if not (new.meta ?& array['courseMapVersion', 'unitId', 'topicAliases'])
      or (select count(*) from jsonb_object_keys(new.meta)) <> 3
      or new.meta ->> 'courseMapVersion' is distinct from 'acct-2010-learning-map-v0'
      or jsonb_typeof(new.meta -> 'unitId') is distinct from 'number'
      or coalesce(new.meta ->> 'unitId', '') !~ '^([1-9]|1[0-5])$'
      or jsonb_typeof(new.meta -> 'topicAliases') is distinct from 'array' then
    raise exception using
      errcode = '23514',
      message = 'invalid stable ACCT 2010 metadata';
  end if;

  if jsonb_array_length(new.meta -> 'topicAliases') not between 1 and 20
      or exists (
        select 1
        from jsonb_array_elements(new.meta -> 'topicAliases') alias_item(value)
        where jsonb_typeof(alias_item.value) is distinct from 'string'
           or char_length(btrim(alias_item.value #>> '{}')) not between 1 and 200
           or (alias_item.value #>> '{}') is distinct from btrim(alias_item.value #>> '{}')
      )
      or (
        select count(*)
        from jsonb_array_elements(new.meta -> 'topicAliases') alias_item(value)
      ) is distinct from (
        select count(distinct lower(btrim(alias_item.value #>> '{}')))
        from jsonb_array_elements(new.meta -> 'topicAliases') alias_item(value)
      ) then
    raise exception using
      errcode = '23514',
      message = 'invalid stable ACCT 2010 topic aliases';
  end if;

  v_unit_id := (new.meta ->> 'unitId')::integer;
  v_expected_identity := format(
    'course-map:acct-2010:v0:unit-%s',
    lpad(v_unit_id::text, 2, '0')
  );
  v_expected_slug := format('acct-2010-unit-%s', lpad(v_unit_id::text, 2, '0'));
  if new.identity_key is distinct from v_expected_identity
      or new.slug is distinct from v_expected_slug then
    raise exception using
      errcode = '23514',
      message = 'stable ACCT 2010 identity does not match its unit';
  end if;

  -- A direct service INSERT still has to target the same owned, active class
  -- identity that the runtime recognized. A course title without the literal
  -- ACCT 2010 identifier is not sufficient.
  perform 1
  from public.classes owned_class
  where owned_class.id = new.class_id
    and owned_class.user_id = new.user_id
    and owned_class.client_class_id = new.client_class_id
    and owned_class.source_archived_at is null
    and (
      upper(owned_class.name) ~ v_course_pattern
      or upper(coalesce(owned_class.meta ->> 'code', '')) ~ v_course_pattern
      or upper(coalesce(owned_class.meta -> 'canvas' ->> 'courseCode', '')) ~ v_course_pattern
    )
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'stable ACCT 2010 concepts require an owned active ACCT 2010 class';
  end if;

  if tg_op = 'UPDATE' then
    -- Stable disciplinary truth is immutable even to a direct service-role
    -- update. Ignore a caller-supplied timestamp and allow only the repository's
    -- generic updated_at trigger to manage it.
    if old.id is distinct from new.id
        or old.user_id is distinct from new.user_id
        or old.class_id is distinct from new.class_id
        or old.client_class_id is distinct from new.client_class_id
        or old.capture_id is distinct from new.capture_id
        or old.identity_key is distinct from new.identity_key
        or old.name is distinct from new.name
        or old.slug is distinct from new.slug
        or old.definition is distinct from new.definition
        or old.examples is distinct from new.examples
        or old.professor_emphasis is distinct from new.professor_emphasis
        or (old.embedding is null) is distinct from (new.embedding is null)
        or old.source_kind is distinct from new.source_kind
        or old.meta is distinct from new.meta
        or old.created_at is distinct from new.created_at
        or old.retired_at is distinct from new.retired_at then
      raise exception using
        errcode = '42501',
        message = 'stable course-map concepts are immutable';
    end if;
    new.updated_at := clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists concepts_protect_stable_course_map on public.concepts;
create trigger concepts_protect_stable_course_map
before insert or update or delete on public.concepts
for each row execute function public.protect_stable_course_map_concept();

-- Atomically seed only the reviewed 15-unit stable map. The RPC does not
-- create user_concept_mastery: a stable curriculum node is not evidence that
-- the student attempted or learned it.
create or replace function public.ensure_acct_2010_map_concepts(
  p_user_id uuid,
  p_class_id uuid,
  p_client_class_id text,
  p_seeds jsonb
)
returns setof public.concepts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes%rowtype;
  v_seed jsonb;
  v_metadata jsonb;
  v_position integer;
  v_unit_id integer;
  v_expected_identity text;
  v_matching_rows integer;
  v_course_pattern constant text := '(^|[^A-Z0-9])ACCT([[:space:]]|-)*2010($|[^A-Z0-9])';
begin
  if p_user_id is null
      or p_class_id is null
      or p_client_class_id is null
      or btrim(p_client_class_id) = ''
      or p_seeds is null
      or jsonb_typeof(p_seeds) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'ACCT 2010 map request is invalid';
  end if;
  if jsonb_array_length(p_seeds) <> 15 then
    raise exception using
      errcode = '22023',
      message = 'ACCT 2010 map requires exactly 15 seeds';
  end if;

  -- Serialize activation with class archive/reparent operations and with every
  -- competing map bootstrap for this class. Validate after acquiring the lock.
  select owned_class.*
    into v_class
  from public.classes owned_class
  where owned_class.id = p_class_id
  for update;

  if not found
      or v_class.user_id is distinct from p_user_id
      or v_class.client_class_id is distinct from p_client_class_id
      or v_class.source_archived_at is not null
      or not (
        upper(v_class.name) ~ v_course_pattern
        or upper(coalesce(v_class.meta ->> 'code', '')) ~ v_course_pattern
        or upper(coalesce(v_class.meta -> 'canvas' ->> 'courseCode', '')) ~ v_course_pattern
      ) then
    raise exception using
      errcode = '42501',
      message = 'ACCT 2010 map requires an owned active literal ACCT 2010 class';
  end if;

  for v_seed, v_position in
    select seed_item.value, seed_item.ordinality::integer
    from jsonb_array_elements(p_seeds) with ordinality
      as seed_item(value, ordinality)
    order by seed_item.ordinality
  loop
    if jsonb_typeof(v_seed) is distinct from 'object' then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 seed must be an object';
    end if;
    if not (v_seed ?& array[
          'identityKey', 'name', 'definition', 'examples',
          'professorEmphasis', 'sourceKind', 'metadata'
        ])
        or (select count(*) from jsonb_object_keys(v_seed)) <> 7 then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 seed keys are invalid';
    end if;

    if jsonb_typeof(v_seed -> 'identityKey') is distinct from 'string'
        or jsonb_typeof(v_seed -> 'name') is distinct from 'string'
        or char_length(btrim(v_seed ->> 'name')) not between 1 and 200
        or btrim(v_seed ->> 'name') is distinct from (v_seed ->> 'name')
        or jsonb_typeof(v_seed -> 'definition') is distinct from 'string'
        or char_length(btrim(v_seed ->> 'definition')) not between 1 and 2000
        or btrim(v_seed ->> 'definition') is distinct from (v_seed ->> 'definition')
        or jsonb_typeof(v_seed -> 'examples') is distinct from 'array'
        or jsonb_typeof(v_seed -> 'professorEmphasis') is distinct from 'boolean'
        or jsonb_typeof(v_seed -> 'sourceKind') is distinct from 'string'
        or jsonb_typeof(v_seed -> 'metadata') is distinct from 'object' then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 stable seed shape is invalid';
    end if;
    if jsonb_array_length(v_seed -> 'examples') <> 0
        or (v_seed -> 'professorEmphasis') is distinct from ('false'::jsonb)
        or v_seed ->> 'sourceKind' is distinct from 'course-map-stable' then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 seed must contain stable-only values';
    end if;

    v_metadata := v_seed -> 'metadata';
    if not (v_metadata ?& array['courseMapVersion', 'unitId', 'topicAliases'])
        or (select count(*) from jsonb_object_keys(v_metadata)) <> 3
        or v_metadata ->> 'courseMapVersion' is distinct from 'acct-2010-learning-map-v0'
        or jsonb_typeof(v_metadata -> 'unitId') is distinct from 'number'
        or coalesce(v_metadata ->> 'unitId', '') !~ '^([1-9]|1[0-5])$'
        or jsonb_typeof(v_metadata -> 'topicAliases') is distinct from 'array' then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 stable metadata is invalid';
    end if;

    v_unit_id := (v_metadata ->> 'unitId')::integer;
    v_expected_identity := format(
      'course-map:acct-2010:v0:unit-%s',
      lpad(v_unit_id::text, 2, '0')
    );
    if v_unit_id <> v_position
        or v_seed ->> 'identityKey' is distinct from v_expected_identity then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 seeds must contain ordered units 1 through 15';
    end if;

    if jsonb_array_length(v_metadata -> 'topicAliases') not between 1 and 20
        or exists (
          select 1
          from jsonb_array_elements(v_metadata -> 'topicAliases') alias_item(value)
          where jsonb_typeof(alias_item.value) is distinct from 'string'
             or char_length(btrim(alias_item.value #>> '{}')) not between 1 and 200
             or (alias_item.value #>> '{}') is distinct from btrim(alias_item.value #>> '{}')
        )
        or (
          select count(*)
          from jsonb_array_elements(v_metadata -> 'topicAliases') alias_item(value)
        ) is distinct from (
          select count(distinct lower(btrim(alias_item.value #>> '{}')))
          from jsonb_array_elements(v_metadata -> 'topicAliases') alias_item(value)
        ) then
      raise exception using
        errcode = '22023',
        message = 'ACCT 2010 topic aliases are invalid';
    end if;
  end loop;

  insert into public.concepts (
    user_id,
    class_id,
    client_class_id,
    capture_id,
    identity_key,
    name,
    slug,
    definition,
    examples,
    professor_emphasis,
    embedding,
    source_kind,
    meta,
    retired_at
  )
  select
    p_user_id,
    p_class_id,
    p_client_class_id,
    null,
    seed_item.value ->> 'identityKey',
    btrim(seed_item.value ->> 'name'),
    format('acct-2010-unit-%s', lpad(seed_item.ordinality::text, 2, '0')),
    btrim(seed_item.value ->> 'definition'),
    array[]::text[],
    false,
    null,
    'course-map-stable',
    seed_item.value -> 'metadata',
    null
  from jsonb_array_elements(p_seeds) with ordinality
    as seed_item(value, ordinality)
  order by seed_item.ordinality
  on conflict (user_id, class_id, identity_key) do nothing;

  -- A preempted or drifted identity fails the whole transaction. This makes
  -- retry idempotent without accepting mutable database prose as stable truth.
  select count(*)
    into v_matching_rows
  from jsonb_array_elements(p_seeds) with ordinality
    as seed_item(value, ordinality)
  join public.concepts concept
    on concept.user_id = p_user_id
   and concept.class_id = p_class_id
   and concept.identity_key = seed_item.value ->> 'identityKey'
  where concept.client_class_id = p_client_class_id
    and concept.capture_id is null
    and concept.name = btrim(seed_item.value ->> 'name')
    and concept.slug = format(
      'acct-2010-unit-%s',
      lpad(seed_item.ordinality::text, 2, '0')
    )
    and concept.definition = btrim(seed_item.value ->> 'definition')
    and concept.examples = array[]::text[]
    and concept.professor_emphasis = false
    and concept.embedding is null
    and concept.source_kind = 'course-map-stable'
    and concept.meta = seed_item.value -> 'metadata'
    and concept.retired_at is null;

  if v_matching_rows <> 15 then
    raise exception using
      errcode = '23505',
      message = 'ACCT 2010 stable concept identity was preempted or changed';
  end if;

  return query
  select concept.*
  from public.concepts concept
  where concept.user_id = p_user_id
    and concept.class_id = p_class_id
    and concept.identity_key in (
      select seed_item.value ->> 'identityKey'
      from jsonb_array_elements(p_seeds) seed_item(value)
    )
  order by (concept.meta ->> 'unitId')::integer;
end;
$$;

revoke all on function public.protect_stable_course_map_concept()
  from public, anon, authenticated;
grant execute on function public.protect_stable_course_map_concept()
  to service_role;

revoke all on function public.ensure_acct_2010_map_concepts(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_acct_2010_map_concepts(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.protect_stable_course_map_concept() is
  'Reserves valid ACCT 2010 stable identities and makes their teaching truth immutable.';
comment on function public.ensure_acct_2010_map_concepts(uuid, uuid, text, jsonb) is
  'Atomically and idempotently ensures exactly 15 original ACCT 2010 stable concepts without creating mastery.';
