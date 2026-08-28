-- Honest readiness and neutral capture seeding.
--
-- Disposable v10 artifacts predate the immutable exam denominator and the
-- evidence contract. They may still be viewed for history, but new results
-- must be generated under v11. Existing zero-attempt seed rows are captured
-- material, not demonstrated knowledge, so repair them to neutral zero.

begin;

-- Operations applies this migration under the verified study-write pause.
-- These locks are the database-side backstop: if a stale worker survived the
-- pause, it cannot race the artifact invalidation or readiness repair.
lock table public.learning_artifacts,
  public.user_concept_mastery,
  public.exams,
  public.classes,
  public.concepts,
  public.readiness_scores
in share row exclusive mode;

update public.learning_artifacts
set stale = true
where prompt_version is distinct from 'v11-evidence-ladder';

update public.user_concept_mastery
set strength = 0,
    streak = 0,
    last_seen_at = null,
    next_review_at = now(),
    updated_at = now()
where attempts = 0;

-- The prior migration intentionally allowed NULL contracts during the paused
-- Edge rollout. Close that compatibility window before writes resume: old or
-- rolled-back Edge revisions must not create fresh tierless attempts and fall
-- back to the pre-ladder mastery RPCs after the v11 stale sweep.
create or replace function public.require_current_study_attempt_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evidence_contract_version is distinct from 2
      or new.evidence_tier is null
      or new.target_task_kind is null then
    raise exception using
      errcode = '22023',
      message = 'current study attempt evidence contract is required';
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_attempts_require_current_contract_v2
  on public.study_result_attempts;
create trigger study_result_attempts_require_current_contract_v2
before insert on public.study_result_attempts
for each row execute function public.require_current_study_attempt_contract_v2();

revoke all on function public.require_current_study_attempt_contract_v2()
  from public, anon, authenticated;
-- The insert trigger above closes fresh legacy attempts. Keep these functions
-- service-only during the cutover so record-study-result can finish an exact
-- failed/processing retry whose authoritative ledger row already predates v2.
-- The Edge function selects them only after loading that existing NULL-contract
-- attempt; browser roles remain unable to execute them.
grant execute on function public.apply_study_concept_result(
  uuid, uuid, uuid, boolean, timestamptz
) to service_role;
grant execute on function public.apply_study_concept_result_v2(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) to service_role;
grant execute on function public.reserve_practice_study_attempt(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) to service_role;

-- Freeze the readiness response separately from the final HTTP payload. The
-- projection is written by one service-only transaction before an attempt is
-- completed, so a lost Edge response can repair history without changing the
-- readiness numbers originally returned for that attempt.
alter table public.study_result_attempts
  add column if not exists readiness_projection jsonb;

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_readiness_projection_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_readiness_projection_check
  check (
    readiness_projection is null
    or (
      jsonb_typeof(readiness_projection) = 'object'
      and readiness_projection ->> 'schemaVersion' = '1'
      and readiness_projection ->> 'scopeType' in ('recent', 'class', 'exam')
      and jsonb_typeof(readiness_projection -> 'classCacheReadiness') = 'number'
      and jsonb_typeof(readiness_projection -> 'classReadiness') = 'number'
      and jsonb_typeof(readiness_projection -> 'classReadinessBefore') = 'number'
      and jsonb_typeof(readiness_projection -> 'responseReadiness') = 'number'
      and jsonb_typeof(readiness_projection -> 'responseReadinessBefore') = 'number'
    )
  );

create or replace function public.freeze_study_readiness_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.readiness_projection is not null
      and new.readiness_projection is distinct from old.readiness_projection then
    raise exception using errcode = '22023', message = 'study readiness projection is immutable';
  end if;
  if old.readiness_projection is null
      and new.readiness_projection is not null
      and new.evidence_contract_version is distinct from 2 then
    raise exception using errcode = '22023', message = 'readiness projection requires contract v2';
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_attempts_freeze_readiness_projection_v1
  on public.study_result_attempts;
create trigger study_result_attempts_freeze_readiness_projection_v1
before update on public.study_result_attempts
for each row execute function public.freeze_study_readiness_projection_v1();

revoke all on function public.freeze_study_readiness_projection_v1()
  from public, anon, authenticated;

-- Close the validation/application race at the database boundary. A new
-- contract-v2 concept update for an exam must lock an active, owner/class-
-- matched exam row before apply_study_concept_result_v3 changes mastery. An
-- already-recorded concept update is an exact retry and may be replayed after
-- the exam or artifact later becomes inactive; the idempotent row wins.
create or replace function public.require_active_exam_for_study_update_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_version smallint;
  v_artifact public.learning_artifacts%rowtype;
  v_exam_marker uuid;
  v_scope_json jsonb;
  v_exam_scope_ids uuid[];
  v_scope_count integer := 0;
  v_scope_distinct_count integer := 0;
  v_active_scope_count integer := 0;
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if exists (
    select 1
    from public.study_result_concept_updates existing_update
    where existing_update.user_id = new.user_id
      and existing_update.client_attempt_id = new.client_attempt_id
  ) then
    -- The first committed update already proved this attempt's active exam
    -- boundary. Let the same bounded attempt finish if the exam is archived
    -- between items; no later attempt can reuse its client_attempt_id.
    return new;
  end if;

  select attempt.evidence_contract_version, artifact
    into v_contract_version, v_artifact
  from public.study_result_attempts attempt
  join public.learning_artifacts artifact
    on artifact.id = attempt.artifact_id
   and artifact.user_id = attempt.user_id
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id;
  if not found or v_contract_version is distinct from 2 then
    return new;
  end if;
  if v_artifact.study_scope_type <> 'exam' then
    return new;
  end if;
  if v_artifact.stale
      or v_artifact.prompt_version <> 'v11-evidence-ladder'
      or v_artifact.study_scope_id !~* v_uuid_pattern then
    raise exception using errcode = '22023', message = 'active exam study artifact is required';
  end if;

  select exam.id
    into v_exam_marker
  from public.exams exam
  where exam.id = v_artifact.study_scope_id::uuid
    and exam.user_id = new.user_id
    and exam.source_archived_at is null
    and (
      (v_artifact.class_id is not null and exam.class_id::text = v_artifact.class_id::text)
      or (
        exam.class_id is null
        and exam.client_class_id = v_artifact.client_class_id
      )
    )
  for update;
  if v_exam_marker is null then
    raise exception using errcode = '22023', message = 'active owned exam not found';
  end if;

  v_scope_json := v_artifact.study_scope_snapshot -> 'readinessScope';
  if jsonb_typeof(v_scope_json) <> 'object'
      or v_scope_json ->> 'schemaVersion' <> '1'
      or v_scope_json ->> 'type' <> 'exam'
      or jsonb_typeof(v_scope_json -> 'conceptIds') <> 'array'
      or exists (
        select 1
        from jsonb_array_elements_text(v_scope_json -> 'conceptIds') item(value)
        where item.value !~* v_uuid_pattern
      ) then
    raise exception using errcode = '22023', message = 'exam readiness scope is invalid';
  end if;
  select
    count(*)::integer,
    count(distinct item.value)::integer,
    array_agg(distinct item.value::uuid order by item.value::uuid)
  into v_scope_count, v_scope_distinct_count, v_exam_scope_ids
  from jsonb_array_elements_text(v_scope_json -> 'conceptIds') item(value);
  if v_scope_count < 1
      or v_scope_count > 100
      or v_scope_count <> v_scope_distinct_count
      or not coalesce(v_artifact.concept_ids <@ v_exam_scope_ids, false) then
    raise exception using errcode = '22023', message = 'exam readiness denominator is invalid';
  end if;

  -- v3 already holds the target concept row before this trigger fires. Lock
  -- every denominator row in deterministic order before accepting the first
  -- mastery update, so a concurrent capture mutation cannot retire one after
  -- validation but before the update commits. Concurrent study attempts that
  -- already hold different target rows can deadlock here; PostgreSQL aborts
  -- one transaction and the idempotent retry protocol safely replays it.
  perform concept.id
  from public.concepts concept
  where concept.user_id = new.user_id
    and concept.id = any(v_exam_scope_ids)
    and concept.retired_at is null
    and (
      concept.class_id::text = v_artifact.class_id::text
      or (
        concept.class_id is null
        and concept.client_class_id = v_artifact.client_class_id
      )
    )
  order by concept.id
  for share;
  get diagnostics v_active_scope_count = row_count;
  if v_active_scope_count <> v_scope_count then
    raise exception using errcode = '22023', message = 'active owned exam denominator not found';
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_concept_updates_require_active_exam_v2
  on public.study_result_concept_updates;
create trigger study_result_concept_updates_require_active_exam_v2
before insert on public.study_result_concept_updates
for each row execute function public.require_active_exam_for_study_update_v2();

revoke all on function public.require_active_exam_for_study_update_v2()
  from public, anon, authenticated;

-- The legacy mastery functions remain service-only solely to finish a row
-- already reserved before the v2 cutover. They may not manufacture a new
-- tierless concept update, reuse a completed ledger, or grade a concept that
-- was not part of that attempt's immutable artifact.
create or replace function public.require_bounded_legacy_study_update_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evidence_contract_version is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.study_result_attempts attempt
    join public.learning_artifacts artifact
      on artifact.id = attempt.artifact_id
     and artifact.user_id = attempt.user_id
    where attempt.user_id = new.user_id
      and attempt.client_attempt_id = new.client_attempt_id
      and attempt.evidence_contract_version is null
      and attempt.result_status = 'processing'
      and new.concept_id = any(artifact.concept_ids)
  ) then
    raise exception using
      errcode = '22023',
      message = 'legacy study update requires an existing bounded attempt';
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_concept_updates_require_bounded_legacy_v2
  on public.study_result_concept_updates;
create trigger study_result_concept_updates_require_bounded_legacy_v2
before insert on public.study_result_concept_updates
for each row execute function public.require_bounded_legacy_study_update_v2();

revoke all on function public.require_bounded_legacy_study_update_v2()
  from public, anon, authenticated;

-- Readiness is a derived projection of contract-v2 mastery. Keep the complete
-- operation in one database transaction: lock the owned class (and active
-- exam when applicable), read every denominator concept with missing mastery
-- as zero, freeze one per-attempt history value, and update the current caches.
-- Serializing on the class row prevents an older concurrent worker from
-- overwriting a newer full-class or exam calculation.
create or replace function public.project_study_readiness_v1(
  p_user_id uuid,
  p_client_attempt_id uuid,
  p_artifact_id uuid,
  p_result_request_hash text,
  p_lease_token uuid,
  p_scored_concept_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_status text;
  v_contract_version smallint;
  v_artifact_id uuid;
  v_attempt_result_request_hash text;
  v_attempt_lease_token uuid;
  v_frozen_projection jsonb;
  v_new_projection jsonb;
  v_artifact public.learning_artifacts%rowtype;
  v_class public.classes%rowtype;
  v_exam public.exams%rowtype;
  v_exam_id uuid;
  v_scope_json jsonb;
  v_exam_scope_ids uuid[];
  v_exam_cache_scope_json jsonb;
  v_exam_cache_scope_ids uuid[];
  v_scope_count integer := 0;
  v_scope_distinct_count integer := 0;
  v_active_exam_scope_count integer := 0;
  v_exam_cache_scope_count integer := 0;
  v_exam_cache_scope_distinct_count integer := 0;
  v_active_exam_cache_scope_count integer := 0;
  v_class_concept_count integer := 0;
  v_class_cache_readiness integer := 0;
  v_class_attempt_readiness integer := 0;
  v_class_before integer := 0;
  v_exam_cache_readiness integer;
  v_exam_attempt_readiness integer;
  v_exam_before integer;
  v_response_readiness integer;
  v_response_before integer;
  v_history_class_id uuid;
  v_history_readiness integer;
  v_exam_is_active boolean := false;
  v_exam_cache_scope_is_current boolean := false;
  v_class_is_active boolean := false;
  v_attempt_has_updates boolean := false;
  v_scored_count integer := 0;
  v_scored_distinct_count integer := 0;
  v_scored_ids uuid[];
  v_recorded_update_ids uuid[];
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if p_user_id is null
      or p_client_attempt_id is null
      or p_artifact_id is null
      or p_result_request_hash is null
      or p_result_request_hash !~ '^[0-9a-f]{64}$'
      or p_lease_token is null
      or p_scored_concept_ids is null then
    raise exception using errcode = '22023', message = 'readiness attempt identity is required';
  end if;

  select
    attempt.result_status,
    attempt.evidence_contract_version,
    attempt.artifact_id,
    attempt.result_request_hash,
    attempt.lease_token,
    attempt.readiness_projection
  into
    v_attempt_status,
    v_contract_version,
    v_artifact_id,
    v_attempt_result_request_hash,
    v_attempt_lease_token,
    v_frozen_projection
  from public.study_result_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.client_attempt_id = p_client_attempt_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'study attempt not found';
  end if;
  if v_contract_version is not null and v_contract_version <> 2 then
    raise exception using errcode = '22023', message = 'supported study evidence contract is required';
  end if;
  if v_attempt_status not in ('processing', 'completed') then
    raise exception using errcode = '55000', message = 'study attempt is not projectable';
  end if;
  if v_contract_version is null and v_attempt_status <> 'processing' then
    raise exception using errcode = '55000', message = 'legacy readiness repair must be in progress';
  end if;
  if v_artifact_id is distinct from p_artifact_id
      or v_attempt_result_request_hash is distinct from p_result_request_hash
      or v_attempt_lease_token is distinct from p_lease_token then
    raise exception using errcode = '40001', message = 'study attempt lease was superseded';
  end if;

  select artifact.*
    into v_artifact
  from public.learning_artifacts artifact
  where artifact.id = v_artifact_id
    and artifact.user_id = p_user_id;
  if not found
      or (v_contract_version = 2 and v_artifact.prompt_version <> 'v11-evidence-ladder') then
    raise exception using errcode = '22023', message = 'current learning artifact not found';
  end if;

  select
    count(*)::integer,
    count(distinct scored.concept_id)::integer,
    array_agg(distinct scored.concept_id order by scored.concept_id)
  into v_scored_count, v_scored_distinct_count, v_scored_ids
  from unnest(p_scored_concept_ids) scored(concept_id);
  if v_scored_count < 1
      or v_scored_count <> v_scored_distinct_count
      or not coalesce(v_scored_ids <@ v_artifact.concept_ids, false) then
    raise exception using errcode = '22023', message = 'scored readiness concepts are invalid';
  end if;

  select array_agg(update_row.concept_id order by update_row.concept_id)
    into v_recorded_update_ids
  from public.study_result_concept_updates update_row
  where update_row.user_id = p_user_id
    and update_row.client_attempt_id = p_client_attempt_id
    and update_row.evidence_contract_version is not distinct from v_contract_version
    and update_row.resulting_strength is not null;
  if coalesce(v_recorded_update_ids, '{}'::uuid[]) <> v_scored_ids then
    raise exception using errcode = '55000', message = 'contract-v2 mastery updates are incomplete';
  end if;

  select exists (
    select 1
    from public.study_result_concept_updates update_row
    where update_row.user_id = p_user_id
      and update_row.client_attempt_id = p_client_attempt_id
      and update_row.evidence_contract_version is not distinct from v_contract_version
  ) into v_attempt_has_updates;

  -- The class row is the serialization lock for every projection in this
  -- owner/class boundary. Legacy client IDs are accepted only when the UUID
  -- link is absent and the owner-scoped compatibility key resolves uniquely.
  if v_artifact.class_id is not null then
    select owned_class.*
      into v_class
    from public.classes owned_class
    where owned_class.id::text = v_artifact.class_id::text
      and owned_class.user_id = p_user_id
      and (
        owned_class.source_archived_at is null
        or v_frozen_projection is not null
        or v_attempt_has_updates
      )
    for update;
  elsif v_artifact.client_class_id is not null then
    select owned_class.*
      into v_class
    from public.classes owned_class
    where owned_class.user_id = p_user_id
      and owned_class.client_class_id = v_artifact.client_class_id
      and (
        owned_class.source_archived_at is null
        or v_frozen_projection is not null
        or v_attempt_has_updates
      )
    for update;
  else
    raise exception using errcode = '22023', message = 'study artifact has no class scope';
  end if;
  if not found
      or (v_artifact.client_class_id is not null
        and v_class.client_class_id is distinct from v_artifact.client_class_id) then
    raise exception using errcode = '22023', message = 'owned class boundary not found';
  end if;
  v_class_is_active := v_class.source_archived_at is null;

  if v_contract_version = 2 and v_artifact.study_scope_type = 'exam' then
    if v_artifact.study_scope_id !~* v_uuid_pattern then
      raise exception using errcode = '22023', message = 'exam study scope is invalid';
    end if;
    v_exam_id := v_artifact.study_scope_id::uuid;
    v_scope_json := v_artifact.study_scope_snapshot -> 'readinessScope';
    if jsonb_typeof(v_scope_json) <> 'object'
        or v_scope_json ->> 'schemaVersion' <> '1'
        or v_scope_json ->> 'type' <> 'exam'
        or jsonb_typeof(v_scope_json -> 'conceptIds') <> 'array' then
      raise exception using errcode = '22023', message = 'exam readiness scope is invalid';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_scope_json -> 'conceptIds') item(value)
      where item.value !~* v_uuid_pattern
    ) then
      raise exception using errcode = '22023', message = 'exam readiness concept is invalid';
    end if;
    select
      count(*)::integer,
      count(distinct item.value)::integer,
      array_agg(distinct item.value::uuid order by item.value::uuid)
    into v_scope_count, v_scope_distinct_count, v_exam_scope_ids
    from jsonb_array_elements_text(v_scope_json -> 'conceptIds') item(value);
    if v_scope_count < 1
        or v_scope_count > 100
        or v_scope_count <> v_scope_distinct_count
        or not coalesce(v_artifact.concept_ids <@ v_exam_scope_ids, false) then
      raise exception using errcode = '22023', message = 'exam readiness denominator is invalid';
    end if;

    select count(*)::integer
      into v_active_exam_scope_count
    from public.concepts concept
    where concept.user_id = p_user_id
      and concept.id = any(v_exam_scope_ids)
      and concept.retired_at is null
      and (
        concept.class_id = v_class.id
        or (
          concept.class_id is null
          and concept.client_class_id = v_class.client_class_id
        )
      );

    select exam.*
      into v_exam
    from public.exams exam
    where exam.id = v_exam_id
      and exam.user_id = p_user_id
      and exam.source_archived_at is null
      and (
        exam.class_id = v_class.id
        or (
          exam.class_id is null
          and exam.client_class_id = v_class.client_class_id
        )
      )
    for update;
    v_exam_is_active := found and v_active_exam_scope_count = v_scope_count;
    if v_frozen_projection is null
        and not v_exam_is_active
        and not v_attempt_has_updates then
      raise exception using errcode = '22023', message = 'active owned exam readiness scope not found';
    end if;

    if v_exam.id is not null then
      -- Current exam cache semantics come from the newest non-stale graded
      -- artifact, not from whichever older attempt happens to finish last.
      -- The attempt snapshot below remains the immutable response denominator.
      select latest.study_scope_snapshot -> 'readinessScope'
        into v_exam_cache_scope_json
      from public.learning_artifacts latest
      where latest.user_id = p_user_id
        and latest.study_scope_type = 'exam'
        and latest.study_scope_id = v_exam_id::text
        and latest.prompt_version = 'v11-evidence-ladder'
        and latest.stale = false
        and latest.kind in ('flashcards', 'multiple_choice', 'matching', 'practice')
      order by latest.created_at desc, latest.id desc
      limit 1;
      if found
          and jsonb_typeof(v_exam_cache_scope_json) = 'object'
          and v_exam_cache_scope_json ->> 'schemaVersion' = '1'
          and v_exam_cache_scope_json ->> 'type' = 'exam'
          and jsonb_typeof(v_exam_cache_scope_json -> 'conceptIds') = 'array'
          and not exists (
            select 1
            from jsonb_array_elements_text(v_exam_cache_scope_json -> 'conceptIds') item(value)
            where item.value !~* v_uuid_pattern
          ) then
        select
          count(*)::integer,
          count(distinct item.value)::integer,
          array_agg(distinct item.value::uuid order by item.value::uuid)
        into
          v_exam_cache_scope_count,
          v_exam_cache_scope_distinct_count,
          v_exam_cache_scope_ids
        from jsonb_array_elements_text(v_exam_cache_scope_json -> 'conceptIds') item(value);

        select count(*)::integer
          into v_active_exam_cache_scope_count
        from public.concepts concept
        where concept.user_id = p_user_id
          and concept.id = any(v_exam_cache_scope_ids)
          and concept.retired_at is null
          and (
            concept.class_id = v_class.id
            or (
              concept.class_id is null
              and concept.client_class_id = v_class.client_class_id
            )
          );
        v_exam_cache_scope_is_current := v_exam_cache_scope_count between 1 and 100
          and v_exam_cache_scope_count = v_exam_cache_scope_distinct_count
          and v_active_exam_cache_scope_count = v_exam_cache_scope_count;
      end if;
    end if;
  elsif v_artifact.study_scope_type not in ('recent', 'class', 'exam') then
    raise exception using errcode = '22023', message = 'study readiness scope type is invalid';
  end if;

  -- The current cache uses current mastery. The frozen attempt values replace
  -- concepts changed by this attempt with the authoritative before/resulting
  -- strengths from the contract-v2 concept-update ledger.
  with class_scope as (
    select
      concept.id as concept_id,
      least(1::real, greatest(0::real, coalesce(mastery.strength, 0::real))) as current_strength,
      update_row.previous_strength,
      update_row.resulting_strength
    from public.concepts concept
    left join public.user_concept_mastery mastery
      on mastery.user_id = concept.user_id
     and mastery.concept_id = concept.id
    left join public.study_result_concept_updates update_row
      on update_row.user_id = p_user_id
     and update_row.client_attempt_id = p_client_attempt_id
     and update_row.concept_id = concept.id
     and update_row.evidence_contract_version is not distinct from v_contract_version
    where concept.user_id = p_user_id
      and concept.retired_at is null
      and (
        concept.class_id = v_class.id
        or (
          concept.class_id is null
          and concept.client_class_id = v_class.client_class_id
        )
      )
  )
  select
    count(*)::integer,
    coalesce(round(100 * avg(current_strength))::integer, 0),
    coalesce(round(100 * avg(
      case
        when resulting_strength is not null
          then least(1::real, greatest(0::real, resulting_strength))
        else current_strength
      end
    ))::integer, 0),
    coalesce(round(100 * avg(
      case
        when previous_strength is not null
          then least(1::real, greatest(0::real, previous_strength))
        else current_strength
      end
    ))::integer, 0)
  into
    v_class_concept_count,
    v_class_cache_readiness,
    v_class_attempt_readiness,
    v_class_before
  from class_scope;

  if v_contract_version = 2 and v_artifact.study_scope_type = 'exam' then
    with exam_scope as (
      select
        scope.concept_id,
        least(1::real, greatest(0::real, coalesce(mastery.strength, 0::real))) as current_strength,
        update_row.previous_strength,
        update_row.resulting_strength
      from unnest(v_exam_scope_ids) scope(concept_id)
      left join public.user_concept_mastery mastery
        on mastery.user_id = p_user_id
       and mastery.concept_id = scope.concept_id
      left join public.study_result_concept_updates update_row
        on update_row.user_id = p_user_id
       and update_row.client_attempt_id = p_client_attempt_id
       and update_row.concept_id = scope.concept_id
       and update_row.evidence_contract_version = 2
    )
    select
      coalesce(round(100 * avg(
        case
          when resulting_strength is not null
            then least(1::real, greatest(0::real, resulting_strength))
          else current_strength
        end
      ))::integer, 0),
      coalesce(round(100 * avg(
        case
          when previous_strength is not null
            then least(1::real, greatest(0::real, previous_strength))
          else current_strength
        end
      ))::integer, 0)
    into v_exam_attempt_readiness, v_exam_before
    from exam_scope;

    if v_exam_cache_scope_is_current then
      select coalesce(round(100 * avg(
        least(1::real, greatest(0::real, coalesce(mastery.strength, 0::real)))
      ))::integer, 0)
        into v_exam_cache_readiness
      from unnest(v_exam_cache_scope_ids) cache_scope(concept_id)
      left join public.user_concept_mastery mastery
        on mastery.user_id = p_user_id
       and mastery.concept_id = cache_scope.concept_id;
    end if;
  end if;

  v_response_readiness := case
    when v_contract_version = 2 and v_artifact.study_scope_type = 'exam' then v_exam_attempt_readiness
    else v_class_attempt_readiness
  end;
  v_response_before := case
    when v_contract_version = 2 and v_artifact.study_scope_type = 'exam' then v_exam_before
    else v_class_before
  end;

  if v_contract_version is null then
    -- Bounded cutover repair only: do not reinterpret legacy evidence or claim
    -- exam readiness without a v11 immutable denominator. Refresh the honest
    -- full-class cache/history under the same serialization lock, then let the
    -- existing NULL-contract attempt complete.
    v_new_projection := jsonb_build_object(
      'schemaVersion', 0,
      'scopeType', v_artifact.study_scope_type,
      'classCacheReadiness', v_class_cache_readiness,
      'classReadiness', v_class_attempt_readiness,
      'classReadinessBefore', v_class_before,
      'responseReadiness', case
        when v_artifact.study_scope_type = 'exam' then null
        else v_class_attempt_readiness
      end,
      'responseReadinessBefore', case
        when v_artifact.study_scope_type = 'exam' then null
        else v_class_before
      end
    );

    insert into public.readiness_scores (
      user_id,
      class_id,
      client_class_id,
      readiness,
      source_attempt_id,
      computed_at
    ) values (
      p_user_id,
      v_class.id,
      v_class.client_class_id,
      v_class_cache_readiness,
      p_client_attempt_id,
      clock_timestamp()
    )
    on conflict (user_id, source_attempt_id) do update set
      class_id = excluded.class_id,
      client_class_id = excluded.client_class_id,
      readiness = excluded.readiness,
      computed_at = excluded.computed_at;

    if v_class_is_active then
      update public.classes owned_class
      set readiness = v_class_cache_readiness,
          updated_at = clock_timestamp()
      where owned_class.id = v_class.id
        and owned_class.user_id = p_user_id;
    end if;

    return v_new_projection;
  end if;

  v_new_projection := jsonb_build_object(
    'schemaVersion', 1,
    'scopeType', v_artifact.study_scope_type,
    'classCacheReadiness', v_class_cache_readiness,
    'classReadiness', v_class_attempt_readiness,
    'classReadinessBefore', v_class_before,
    'classConceptCount', v_class_concept_count,
    'examCacheReadiness', v_exam_cache_readiness,
    'examReadiness', v_exam_attempt_readiness,
    'examReadinessBefore', v_exam_before,
    'examConceptCount', case
      when v_artifact.study_scope_type = 'exam' then v_scope_count
      else null
    end,
    'responseReadiness', v_response_readiness,
    'responseReadinessBefore', v_response_before,
    'projectedAt', clock_timestamp()
  );

  if v_frozen_projection is null then
    update public.study_result_attempts attempt
    set readiness_projection = v_new_projection,
        updated_at = clock_timestamp()
    where attempt.user_id = p_user_id
      and attempt.client_attempt_id = p_client_attempt_id
    returning attempt.readiness_projection into v_frozen_projection;
  end if;
  if v_frozen_projection ->> 'schemaVersion' <> '1'
      or jsonb_typeof(v_frozen_projection -> 'classCacheReadiness') <> 'number'
      or jsonb_typeof(v_frozen_projection -> 'classReadiness') <> 'number'
      or jsonb_typeof(v_frozen_projection -> 'classReadinessBefore') <> 'number'
      or jsonb_typeof(v_frozen_projection -> 'responseReadiness') <> 'number'
      or jsonb_typeof(v_frozen_projection -> 'responseReadinessBefore') <> 'number' then
    raise exception using errcode = '22023', message = 'frozen readiness projection is invalid';
  end if;

  insert into public.readiness_scores (
    user_id,
    class_id,
    client_class_id,
    readiness,
    source_attempt_id,
    computed_at
  ) values (
    p_user_id,
    v_class.id,
    v_class.client_class_id,
    (v_frozen_projection ->> 'classCacheReadiness')::integer,
    p_client_attempt_id,
    (v_frozen_projection ->> 'projectedAt')::timestamptz
  )
  on conflict (user_id, source_attempt_id) do update set
    class_id = excluded.class_id,
    client_class_id = excluded.client_class_id,
    readiness = excluded.readiness,
    computed_at = excluded.computed_at;

  select score.class_id, score.readiness
    into v_history_class_id, v_history_readiness
  from public.readiness_scores score
  where score.user_id = p_user_id
    and score.source_attempt_id = p_client_attempt_id;
  if not found
      or v_history_class_id is distinct from v_class.id
      or v_history_readiness is distinct from (v_frozen_projection ->> 'classCacheReadiness')::integer then
    raise exception using errcode = '23514', message = 'readiness history conflicts with its attempt';
  end if;

  if v_class_is_active then
    update public.classes owned_class
    set readiness = v_class_cache_readiness,
        updated_at = clock_timestamp()
    where owned_class.id = v_class.id
      and owned_class.user_id = p_user_id;
  end if;

  -- Every retry may repair the current test cache, but only from the newest
  -- authoritative non-stale denominator selected above. The attempt's older
  -- immutable scope is used solely for its frozen response.
  if v_class_is_active
      and v_exam.id is not null
      and v_exam_cache_scope_is_current
      and v_exam_cache_readiness is not null then
    update public.exams exam
    set readiness = v_exam_cache_readiness,
        updated_at = clock_timestamp()
    where exam.id = v_exam_id
      and exam.user_id = p_user_id
      and exam.source_archived_at is null;
  end if;

  return v_frozen_projection;
end;
$$;

revoke all on function public.project_study_readiness_v1(uuid, uuid, uuid, text, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.project_study_readiness_v1(uuid, uuid, uuid, text, uuid, uuid[])
  to service_role;

comment on function public.project_study_readiness_v1(uuid, uuid, uuid, text, uuid, uuid[]) is
  'Service-only atomic contract-v2 projection: serializes full-class and immutable-exam readiness, freezes idempotent attempt history, and counts missing mastery as zero.';

-- Historical exam readiness used whichever concepts happened to appear in one
-- artifact. There is no trustworthy denominator to reconstruct, so reset it.
update public.exams
set readiness = 0,
    updated_at = now();

create temporary table repaired_class_readiness on commit drop as
select
  owned_class.user_id,
  owned_class.id as class_id,
  owned_class.client_class_id,
  round(
    100 * avg(
      coalesce(
        least(
          1::real,
          greatest(0::real, coalesce(mastery.strength, 0::real))
        ),
        0::real
      )
    )
  )::integer as readiness
from public.classes owned_class
left join public.concepts concept
  on concept.user_id = owned_class.user_id
 and concept.retired_at is null
 and (
   concept.class_id = owned_class.id
   or (
     concept.class_id is null
     and concept.client_class_id = owned_class.client_class_id
   )
 )
left join public.user_concept_mastery mastery
  on mastery.user_id = concept.user_id
 and mastery.concept_id = concept.id
where owned_class.source_archived_at is null
group by owned_class.user_id, owned_class.id, owned_class.client_class_id;

update public.classes owned_class
set readiness = repaired.readiness,
    updated_at = now()
from repaired_class_readiness repaired
where repaired.user_id = owned_class.user_id
  and repaired.class_id = owned_class.id;

insert into public.readiness_scores (
  user_id,
  class_id,
  client_class_id,
  readiness,
  source_attempt_id,
  computed_at
)
select
  repaired.user_id,
  repaired.class_id,
  repaired.client_class_id,
  repaired.readiness,
  null,
  clock_timestamp()
from repaired_class_readiness repaired;

-- Read-only production canary: its presence proves fresh tierless writes are
-- closed, while service-only legacy RPCs remain available solely for bounded
-- repair of already-existing NULL-contract attempts.
create or replace function public.get_learning_evidence_contract_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'artifactPromptVersion', 'v11-evidence-ladder',
    'contractVersion', 2,
    'legacyWritesClosed', true,
    'readinessScopeVersion', 1
  );
$$;

revoke all on function public.get_learning_evidence_contract_status()
  from public, anon;
grant execute on function public.get_learning_evidence_contract_status()
  to authenticated, service_role;

commit;
