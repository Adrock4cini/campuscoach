-- Assignment Tutor mastery guard.
--
-- A generated artifact UUID is disposable, so it cannot be the uniqueness
-- boundary for mastery. The Edge function derives this fingerprint from the
-- verified assignment plus the canonical deterministic original/transfer
-- challenge. One student can therefore receive mastery credit from that
-- challenge only once, even if the artifact is regenerated or two requests
-- race. A failed/unknown response is recovered with the same client attempt;
-- a new attempt may not silently claim the challenge again.

alter table public.study_result_attempts
  add column if not exists challenge_fingerprint text,
  add column if not exists client_request_hash text,
  add column if not exists verified_grading_snapshot jsonb;

-- Derived readiness and strategy evidence must be repairable after mastery
-- commits but an Edge response is lost. These durable attempt keys make each
-- best-effort projection idempotent without coupling it to the disposable
-- artifact/attempt foreign-key lifecycle.
alter table public.readiness_scores
  add column if not exists source_attempt_id uuid;

create unique index if not exists readiness_scores_attempt_uidx
  on public.readiness_scores (user_id, source_attempt_id);

alter table public.study_strategy_outcomes
  add column if not exists client_attempt_id uuid;

create unique index if not exists study_strategy_outcomes_attempt_uidx
  on public.study_strategy_outcomes (user_id, client_attempt_id);

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_challenge_fingerprint_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_challenge_fingerprint_check
  check (
    challenge_fingerprint is null
    or challenge_fingerprint ~ '^[0-9a-f]{64}$'
  );

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_client_request_hash_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_client_request_hash_check
  check (
    client_request_hash is null
    or client_request_hash ~ '^[0-9a-f]{64}$'
  );

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_verified_practice_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_verified_practice_check
  check (
    (challenge_fingerprint is null
      and client_request_hash is null
      and verified_grading_snapshot is null)
    or
    (challenge_fingerprint is not null
      and client_request_hash is not null
      and verified_grading_snapshot is not null
      and jsonb_typeof(verified_grading_snapshot) = 'object')
  );

-- This ledger deliberately does not cascade from learning_artifacts. Artifacts
-- are disposable views; deleting one must not erase the fact that its
-- canonical challenge already affected mastery.
create table if not exists public.practice_challenge_consumptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_fingerprint text not null,
  client_attempt_id uuid not null,
  artifact_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_fingerprint),
  unique (user_id, client_attempt_id),
  constraint practice_challenge_consumptions_hash_check
    check (challenge_fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.practice_challenge_consumptions enable row level security;
revoke all on table public.practice_challenge_consumptions from public, anon, authenticated;
grant all on table public.practice_challenge_consumptions to service_role;

-- Reserve the immutable first response and the one-time challenge claim in one
-- database transaction. A per-user transaction lock keeps two new challenges
-- from observing an empty ledger at the same time; the unique constraints are
-- the final integrity boundary. Returning a disposition lets the Edge function
-- distinguish an ordinary retry race from a regenerated duplicate challenge.
create or replace function public.reserve_practice_study_attempt(
  p_user_id uuid,
  p_client_attempt_id uuid,
  p_artifact_id uuid,
  p_challenge_fingerprint text,
  p_result_request_hash text,
  p_client_request_hash text,
  p_verified_grading_snapshot jsonb,
  p_lease_token uuid,
  p_lease_started_at timestamptz,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_attempt_id uuid;
  v_existing_attempt public.study_result_attempts%rowtype;
  v_existing_consumption public.practice_challenge_consumptions%rowtype;
  v_existing_update public.study_result_concept_updates%rowtype;
  v_artifact public.learning_artifacts%rowtype;
  v_capture public.captures%rowtype;
  v_assignment public.assignments%rowtype;
  v_capture_id uuid;
  v_concept_id uuid;
  v_source_version integer;
  v_source_hash text;
  v_apply_result jsonb;
  v_disposition text := 'reserved';
begin
  if p_user_id is null
      or p_client_attempt_id is null
      or p_artifact_id is null
      or p_challenge_fingerprint is null
      or p_challenge_fingerprint !~ '^[0-9a-f]{64}$'
      or p_result_request_hash is null
      or p_result_request_hash !~ '^[0-9a-f]{64}$'
      or p_client_request_hash is null
      or p_client_request_hash !~ '^[0-9a-f]{64}$'
      or p_verified_grading_snapshot is null
      or jsonb_typeof(p_verified_grading_snapshot) <> 'object'
      or coalesce(p_verified_grading_snapshot ->> 'version', '') <> '1'
      or coalesce(p_verified_grading_snapshot ->> 'conceptId', '')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(p_verified_grading_snapshot -> 'correct') is distinct from 'boolean'
      or coalesce(p_verified_grading_snapshot ->> 'confidence', '') not in ('low', 'medium', 'high')
      or p_verified_grading_snapshot ->> 'challengeFingerprint' is distinct from p_challenge_fingerprint
      or p_verified_grading_snapshot ->> 'resultRequestHash' is distinct from p_result_request_hash
      or p_lease_token is null
      or p_lease_started_at is null
      or p_duration_seconds is null
      or p_duration_seconds < 0
      or p_duration_seconds > 86400 then
    raise exception using
      errcode = '22023',
      message = 'invalid practice study reservation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('practice-study:' || p_user_id::text, 0)
  );

  v_concept_id := (p_verified_grading_snapshot ->> 'conceptId')::uuid;

  select attempt.*
    into v_existing_attempt
  from public.study_result_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.client_attempt_id = p_client_attempt_id
  for update;

  if found then
    if v_existing_attempt.artifact_id is distinct from p_artifact_id
        or v_existing_attempt.challenge_fingerprint is distinct from p_challenge_fingerprint
        or v_existing_attempt.result_request_hash is distinct from p_result_request_hash
        or v_existing_attempt.client_request_hash is distinct from p_client_request_hash
        or v_existing_attempt.verified_grading_snapshot is distinct from p_verified_grading_snapshot then
      return jsonb_build_object(
        'disposition', 'attempt-mismatch',
        'ownerAttemptId', p_client_attempt_id
      );
    end if;

    -- The mastery write and its marker commit together. If a prior request
    -- lost its HTTP response after that commit, return the durable result even
    -- when its presentation/history rows still need repair.
    select update_row.*
      into v_existing_update
    from public.study_result_concept_updates update_row
    where update_row.user_id = p_user_id
      and update_row.client_attempt_id = p_client_attempt_id
      and update_row.concept_id = v_concept_id;

    if found and v_existing_update.resulting_strength is not null then
      return jsonb_build_object(
        'disposition', 'attempt-exists',
        'ownerAttemptId', p_client_attempt_id,
        'masteryApplied', false,
        'previousStrength', v_existing_update.previous_strength,
        'resultingStrength', v_existing_update.resulting_strength
      );
    end if;
    v_disposition := 'attempt-exists';
  else
    -- The attempt row references the disposable artifact and can be removed by
    -- artifact cleanup, while the one-time challenge ledger intentionally
    -- survives. Resolve the surviving client-attempt claim before INSERT so a
    -- reused UUID returns a stable disposition instead of a unique violation.
    select consumption.*
      into v_existing_consumption
    from public.practice_challenge_consumptions consumption
    where consumption.user_id = p_user_id
      and consumption.client_attempt_id = p_client_attempt_id
    for update;

    if found then
      if v_existing_consumption.challenge_fingerprint is distinct from p_challenge_fingerprint
          or v_existing_consumption.artifact_id is distinct from p_artifact_id then
        return jsonb_build_object(
          'disposition', 'attempt-mismatch',
          'ownerAttemptId', p_client_attempt_id
        );
      end if;

      select update_row.*
        into v_existing_update
      from public.study_result_concept_updates update_row
      where update_row.user_id = p_user_id
        and update_row.client_attempt_id = p_client_attempt_id
        and update_row.concept_id = v_concept_id;

      if found and v_existing_update.resulting_strength is not null then
        return jsonb_build_object(
          'disposition', 'attempt-exists',
          'ownerAttemptId', p_client_attempt_id,
          'masteryApplied', false,
          'previousStrength', v_existing_update.previous_strength,
          'resultingStrength', v_existing_update.resulting_strength
        );
      end if;

      return jsonb_build_object(
        'disposition', 'challenge-conflict',
        'ownerAttemptId', p_client_attempt_id
      );
    end if;

    select consumption.client_attempt_id
      into v_owner_attempt_id
    from public.practice_challenge_consumptions consumption
    where consumption.user_id = p_user_id
      and consumption.challenge_fingerprint = p_challenge_fingerprint;

    if found then
      return jsonb_build_object(
        'disposition', 'challenge-conflict',
        'ownerAttemptId', v_owner_attempt_id
      );
    end if;
  end if;

  -- Read the capture id, lock the capture first (the same order used by source
  -- confirmation), then lock and re-read the artifact. The held locks make
  -- source validation and the mastery write one linearizable transaction.
  select artifact.capture_id
    into v_capture_id
  from public.learning_artifacts artifact
  where artifact.id = p_artifact_id
    and artifact.user_id = p_user_id;

  if v_capture_id is null then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  select capture.*
    into v_capture
  from public.captures capture
  where capture.id = v_capture_id
    and capture.user_id = p_user_id
  for share;

  if not found then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  select artifact.*
    into v_artifact
  from public.learning_artifacts artifact
  where artifact.id = p_artifact_id
    and artifact.user_id = p_user_id
  for share;

  if not found
      or v_artifact.capture_id is distinct from v_capture.id
      or v_artifact.kind <> 'practice'
      or v_artifact.stale
      or pg_catalog.cardinality(v_artifact.concept_ids) <> 1
      or v_artifact.concept_ids[1] is distinct from v_concept_id
      or coalesce(v_artifact.study_scope_snapshot ->> 'intent', '') <> 'assignment-help'
      or coalesce(v_artifact.study_scope_snapshot ->> 'practiceSourceVersion', '') !~ '^[1-9][0-9]*$'
      or coalesce(v_artifact.study_scope_snapshot ->> 'practiceSourceHash', '') !~ '^[0-9a-f]{64}$'
      or coalesce(v_artifact.study_scope_snapshot ->> 'practiceConceptId', '')
        is distinct from v_concept_id::text
      or coalesce(v_artifact.study_scope_snapshot ->> 'assignmentId', '')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  v_source_version := (v_artifact.study_scope_snapshot ->> 'practiceSourceVersion')::integer;
  v_source_hash := v_artifact.study_scope_snapshot ->> 'practiceSourceHash';

  select assignment.*
    into v_assignment
  from public.assignments assignment
  where assignment.id = (v_artifact.study_scope_snapshot ->> 'assignmentId')::uuid
    and assignment.user_id = p_user_id
    and assignment.source_archived_at is null
  for share;

  if not found
      or v_capture.kind <> 'scan-assignment'
      or v_capture.processing_status <> 'ready'
      or v_capture.concept_extraction_claim_id is not null
      or v_capture.practice_source_status <> 'confirmed'
      or v_capture.practice_source_version is distinct from v_source_version
      or v_capture.practice_source_hash is distinct from v_source_hash
      or v_capture.practice_concept_id is distinct from v_concept_id
      or v_capture.assignment_id is distinct from v_assignment.id
      or v_capture.class_id is distinct from v_assignment.class_id
      or v_capture.client_class_id is distinct from v_assignment.client_class_id
      or v_capture.class_id::text is distinct from v_artifact.class_id
      or v_capture.client_class_id is distinct from v_artifact.client_class_id
      or v_artifact.payload -> 'problems' -> 0 ->> 'conceptId' is distinct from v_concept_id::text
      or v_artifact.payload -> 'problems' -> 0 ->> 'sourceExcerpt' is distinct from v_capture.practice_source_text
      or not exists (
        select 1
        from public.concept_capture_evidence evidence
        join public.concepts concept
          on concept.id = evidence.concept_id
         and concept.user_id = evidence.user_id
         and concept.retired_at is null
        where evidence.user_id = p_user_id
          and evidence.concept_id = v_concept_id
          and evidence.capture_id = v_capture.id
      ) then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  if v_disposition = 'reserved' then
    insert into public.study_result_attempts (
      user_id,
      client_attempt_id,
      artifact_id,
      challenge_fingerprint,
      client_request_hash,
      verified_grading_snapshot,
      result_request_hash,
      result_status,
      lease_token,
      lease_started_at,
      duration_seconds
    ) values (
      p_user_id,
      p_client_attempt_id,
      p_artifact_id,
      p_challenge_fingerprint,
      p_client_request_hash,
      p_verified_grading_snapshot,
      p_result_request_hash,
      'processing',
      p_lease_token,
      p_lease_started_at,
      p_duration_seconds
    );

    insert into public.practice_challenge_consumptions (
      user_id,
      challenge_fingerprint,
      client_attempt_id,
      artifact_id
    ) values (
      p_user_id,
      p_challenge_fingerprint,
      p_client_attempt_id,
      p_artifact_id
    );
  end if;

  v_apply_result := public.apply_study_concept_result_v2(
    p_user_id,
    p_client_attempt_id,
    v_concept_id,
    v_capture.class_id,
    (p_verified_grading_snapshot ->> 'correct')::boolean,
    p_verified_grading_snapshot ->> 'confidence',
    false,
    p_lease_started_at
  );

  return jsonb_build_object(
    'disposition', v_disposition,
    'ownerAttemptId', p_client_attempt_id,
    'masteryApplied', coalesce((v_apply_result ->> 'applied')::boolean, false),
    'previousStrength', v_apply_result -> 'previousStrength',
    'resultingStrength', v_apply_result -> 'resultingStrength'
  );
end;
$$;

revoke all on function public.reserve_practice_study_attempt(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.reserve_practice_study_attempt(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) to service_role;

comment on column public.study_result_attempts.challenge_fingerprint is
  'Server-derived canonical practice challenge hash retained with the result attempt for audit and exact replay.';

comment on column public.study_result_attempts.client_request_hash is
  'Hash of the immutable raw first-check request, independent of the current deterministic builder implementation.';

comment on column public.study_result_attempts.verified_grading_snapshot is
  'Service-only grading facts frozen when a new canonical practice attempt is atomically reserved.';

comment on table public.practice_challenge_consumptions is
  'Non-artifact-cascading, service-only one-time mastery claim for canonical assignment-practice challenges.';
