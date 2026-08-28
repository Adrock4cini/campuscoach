-- Learning Evidence Ladder, contract v2.
--
-- Contract-v2 rows freeze both what the student demonstrated and the task the
-- artifact was intended to teach. NULL remains the explicit legacy contract,
-- which lets the database and Edge functions roll forward independently
-- without silently reinterpreting historical attempts.

begin;

alter table public.study_result_attempts
  add column if not exists evidence_contract_version smallint,
  add column if not exists evidence_tier text,
  add column if not exists target_task_kind text;

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_evidence_contract_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_evidence_contract_check
  check (
    (
      evidence_contract_version is null
      and evidence_tier is null
      and target_task_kind is null
    )
    or
    (
      evidence_contract_version = 2
      and evidence_tier in (
        'exposure', 'recall', 'discrimination', 'application', 'transfer'
      )
      and target_task_kind in (
        'memorize-terms',
        'understand-concept',
        'solve-problems',
        'sequence-events',
        'compare-ideas',
        'apply-procedure'
      )
    )
  );

alter table public.study_result_concept_updates
  add column if not exists evidence_contract_version smallint,
  add column if not exists evidence_tier text,
  add column if not exists target_task_kind text;

alter table public.study_result_concept_updates
  drop constraint if exists study_result_concept_updates_evidence_contract_check;

alter table public.study_result_concept_updates
  add constraint study_result_concept_updates_evidence_contract_check
  check (
    (
      evidence_contract_version is null
      and evidence_tier is null
      and target_task_kind is null
    )
    or
    (
      evidence_contract_version = 2
      and evidence_tier in (
        'exposure', 'recall', 'discrimination', 'application', 'transfer'
      )
      and target_task_kind in (
        'memorize-terms',
        'understand-concept',
        'solve-problems',
        'sequence-events',
        'compare-ideas',
        'apply-procedure'
      )
    )
  );

alter table public.study_strategy_outcomes
  add column if not exists evidence_contract_version smallint,
  add column if not exists evidence_tier text;

alter table public.study_strategy_outcomes
  drop constraint if exists study_strategy_outcomes_evidence_contract_check;

alter table public.study_strategy_outcomes
  add constraint study_strategy_outcomes_evidence_contract_check
  check (
    (
      outcome_source = 'feedback'
      and client_attempt_id is null
      and evidence_contract_version is null
      and evidence_tier is null
    )
    or
    (
      outcome_source = 'study_result'
      and (
        (evidence_contract_version is null and evidence_tier is null)
        or
        (
          evidence_contract_version = 2
          and client_attempt_id is not null
          and evidence_tier in (
            'exposure', 'recall', 'discrimination', 'application', 'transfer'
          )
          and task_kind in (
            'memorize-terms',
            'understand-concept',
            'solve-problems',
            'sequence-events',
            'compare-ideas',
            'apply-procedure'
          )
        )
      )
    )
  );

-- The attempt ledger is the semantic authority. Do not trust a browser or an
-- Edge caller to label its own evidence. Contract-v2 inserts are checked
-- against the immutable artifact; legacy callers that omit the new fields
-- remain explicitly legacy (all three NULL) during a rolling Edge rollout.
create or replace function public.freeze_study_attempt_evidence_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.artifact_kind;
  v_snapshot_task text;
  v_evidence_tier text;
  v_target_task_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.artifact_id is distinct from old.artifact_id then
      raise exception using
        errcode = '22023',
        message = 'study attempt artifact is immutable';
    end if;
    if new.evidence_contract_version is distinct from old.evidence_contract_version
        or new.evidence_tier is distinct from old.evidence_tier
        or new.target_task_kind is distinct from old.target_task_kind then
      raise exception using
        errcode = '22023',
        message = 'study attempt evidence contract is immutable';
    end if;
    return new;
  end if;

  select artifact.kind,
         artifact.study_scope_snapshot #>> '{strategy,taskKind}'
    into v_kind, v_snapshot_task
  from public.learning_artifacts artifact
  where artifact.id = new.artifact_id
    and artifact.user_id = new.user_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'study attempt artifact boundary not found';
  end if;

  v_evidence_tier := case v_kind
    when 'flashcards'::public.artifact_kind then 'recall'
    when 'multiple_choice'::public.artifact_kind then 'discrimination'
    when 'matching'::public.artifact_kind then 'discrimination'
    when 'practice'::public.artifact_kind then 'transfer'
    else null
  end;

  v_target_task_kind := case
    when v_kind = 'practice'::public.artifact_kind then 'solve-problems'
    when v_snapshot_task in (
      'memorize-terms',
      'understand-concept',
      'solve-problems',
      'sequence-events',
      'compare-ideas',
      'apply-procedure'
    ) then v_snapshot_task
    else null
  end;

  if new.evidence_contract_version is null then
    if new.evidence_tier is not null or new.target_task_kind is not null then
      raise exception using
        errcode = '22023',
        message = 'legacy study attempt cannot claim evidence contract fields';
    end if;
    return new;
  end if;

  if new.evidence_contract_version is distinct from 2
      or v_evidence_tier is null
      or v_target_task_kind is null
      or new.evidence_tier is distinct from v_evidence_tier
      or new.target_task_kind is distinct from v_target_task_kind then
    raise exception using
      errcode = '22023',
      message = 'study attempt evidence does not match its artifact contract';
  end if;

  return new;
end;
$$;

drop trigger if exists study_result_attempts_freeze_evidence_contract_v2
  on public.study_result_attempts;
create trigger study_result_attempts_freeze_evidence_contract_v2
before insert or update on public.study_result_attempts
for each row execute function public.freeze_study_attempt_evidence_contract_v2();

-- Concept-update rows are an immutable audit projection of the attempt. A
-- legacy direct call without an authoritative attempt remains legacy rather
-- than receiving a guessed tier.
create or replace function public.freeze_study_concept_update_evidence_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_version smallint;
  v_evidence_tier text;
  v_target_task_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.client_attempt_id is distinct from old.client_attempt_id
        or new.outcome_source is distinct from old.outcome_source
        or new.evidence_contract_version is distinct from old.evidence_contract_version
        or new.evidence_tier is distinct from old.evidence_tier
        or new.target_task_kind is distinct from old.target_task_kind then
      raise exception using
        errcode = '22023',
        message = 'study concept evidence contract is immutable';
    end if;
    return new;
  end if;

  select attempt.evidence_contract_version,
         attempt.evidence_tier,
         attempt.target_task_kind
    into v_contract_version, v_evidence_tier, v_target_task_kind
  from public.study_result_attempts attempt
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id;

  if found and v_contract_version = 2 then
    new.evidence_contract_version := v_contract_version;
    new.evidence_tier := v_evidence_tier;
    new.target_task_kind := v_target_task_kind;
  else
    new.evidence_contract_version := null;
    new.evidence_tier := null;
    new.target_task_kind := null;
  end if;

  return new;
end;
$$;

drop trigger if exists study_result_concept_updates_freeze_evidence_contract_v2
  on public.study_result_concept_updates;
create trigger study_result_concept_updates_freeze_evidence_contract_v2
before insert or update on public.study_result_concept_updates
for each row execute function public.freeze_study_concept_update_evidence_contract_v2();

-- Study-result strategy rows inherit evidence from their attempt. Feedback is
-- a preference signal, not proof of learning, and therefore must stay tierless.
create or replace function public.freeze_strategy_outcome_evidence_contract_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_version smallint;
  v_evidence_tier text;
  v_target_task_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.evidence_contract_version is distinct from old.evidence_contract_version
        or new.evidence_tier is distinct from old.evidence_tier
        or (
          old.evidence_contract_version = 2
          and new.task_kind is distinct from old.task_kind
        ) then
      raise exception using
        errcode = '22023',
        message = 'strategy outcome evidence contract is immutable';
    end if;
    return new;
  end if;

  if new.outcome_source = 'feedback' then
    if new.client_attempt_id is not null
        or new.evidence_contract_version is not null
        or new.evidence_tier is not null then
      raise exception using
        errcode = '22023',
        message = 'feedback cannot claim a study attempt or learning evidence';
    end if;
    return new;
  end if;

  select attempt.evidence_contract_version,
         attempt.evidence_tier,
         attempt.target_task_kind
    into v_contract_version, v_evidence_tier, v_target_task_kind
  from public.study_result_attempts attempt
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id;

  if found and v_contract_version = 2 then
    new.evidence_contract_version := v_contract_version;
    new.evidence_tier := v_evidence_tier;
    new.task_kind := v_target_task_kind;
  else
    new.evidence_contract_version := null;
    new.evidence_tier := null;
  end if;

  return new;
end;
$$;

drop trigger if exists study_strategy_outcomes_freeze_evidence_contract_v2
  on public.study_strategy_outcomes;
create trigger study_strategy_outcomes_freeze_evidence_contract_v2
before insert or update on public.study_strategy_outcomes
for each row execute function public.freeze_strategy_outcome_evidence_contract_v2();

-- Contract-v2 mastery application. The function never accepts a tier or task
-- argument: it reads the frozen server-derived values from the attempt ledger.
-- Current flashcards are self-reported only after reveal, so recall is useful
-- adaptive evidence but contributes no positive performance mastery. A miss
-- remains meaningful negative evidence at every tier.
create or replace function public.apply_study_concept_result_v3(
  p_user_id uuid,
  p_attempt_id uuid,
  p_concept_id uuid,
  p_class_id uuid,
  p_correct boolean,
  p_confidence text,
  p_recovered boolean default false,
  p_seen_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_marker uuid;
  v_class_id uuid;
  v_contract_version smallint;
  v_evidence_tier text;
  v_target_task_kind text;
  v_evidence_rank integer;
  v_required_rank integer;
  v_positive_credit boolean := false;
  v_strength_ceiling real := 1;
  v_requested_delta real := 0;
  v_actual_delta real := 0;
  v_previous_strength real := 0;
  v_previous_attempts integer := 0;
  v_previous_correct integer := 0;
  v_previous_streak integer := 0;
  v_resulting_strength real;
  v_resulting_attempts integer;
  v_resulting_correct integer;
  v_resulting_streak integer;
  v_next_hours integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_attempt_id is null or p_concept_id is null or p_correct is null or p_recovered is null then
    raise exception 'Missing study result fields';
  end if;
  if p_confidence is null or p_confidence not in ('low', 'medium', 'high') then
    raise exception 'Invalid confidence level';
  end if;
  if p_seen_at is null
      or p_seen_at < now() - interval '10 minutes'
      or p_seen_at > now() + interval '5 minutes' then
    raise exception 'Invalid study result timestamp';
  end if;

  select attempt.evidence_contract_version,
         attempt.evidence_tier,
         attempt.target_task_kind
    into v_contract_version, v_evidence_tier, v_target_task_kind
  from public.study_result_attempts attempt
  join public.learning_artifacts artifact
    on artifact.id = attempt.artifact_id
   and artifact.user_id = attempt.user_id
  where attempt.user_id = v_user_id
    and attempt.client_attempt_id = p_attempt_id
    and p_concept_id = any(artifact.concept_ids)
  for share;

  if not found
      or v_contract_version is distinct from 2
      or v_evidence_tier is null
      or v_target_task_kind is null then
    raise exception using
      errcode = '22023',
      message = 'study attempt lacks evidence contract v2';
  end if;

  v_evidence_rank := case v_evidence_tier
    when 'exposure' then 0
    when 'recall' then 1
    when 'discrimination' then 2
    when 'application' then 3
    when 'transfer' then 4
    else -1
  end;
  v_required_rank := case v_target_task_kind
    when 'memorize-terms' then 1
    when 'sequence-events' then 1
    when 'understand-concept' then 2
    when 'compare-ideas' then 2
    when 'solve-problems' then 3
    when 'apply-procedure' then 3
    else 5
  end;
  v_strength_ceiling := case v_evidence_tier
    -- Choice recognition is useful evidence, but it must remain below the
    -- product's 75% "Strong" / 80% "Exam ready" presentation thresholds.
    when 'discrimination' then 0.74
    when 'application' then 0.92
    when 'transfer' then 1.00
    else 1.00
  end;

  -- The concept row provides a stable owner-checked lock even when an older
  -- capture is missing its seeded mastery row.
  select concept.id, concept.class_id
    into v_marker, v_class_id
  from public.concepts concept
  where concept.id = p_concept_id
    and concept.user_id = v_user_id
  for update;
  if v_marker is null then
    raise exception 'Concept not found';
  end if;
  if v_class_id is not null then
    v_marker := null;
    select owned_class.id
      into v_marker
    from public.classes owned_class
    where owned_class.id = v_class_id
      and owned_class.user_id = v_user_id
      and owned_class.source_archived_at is null;
    if v_marker is null then
      raise exception 'Class not found';
    end if;
    if p_class_id is not null and v_class_id <> p_class_id then
      raise exception 'Concept does not belong to this class';
    end if;
  elsif p_class_id is not null then
    select owned_class.id
      into v_class_id
    from public.classes owned_class
    where owned_class.id = p_class_id
      and owned_class.user_id = v_user_id
      and owned_class.source_archived_at is null;
    if v_class_id is null then
      raise exception 'Class not found';
    end if;
  end if;

  select mastery.strength, mastery.attempts, mastery.correct, mastery.streak
    into v_previous_strength, v_previous_attempts, v_previous_correct, v_previous_streak
  from public.user_concept_mastery mastery
  where mastery.user_id = v_user_id
    and mastery.concept_id = p_concept_id
  for update;

  v_previous_strength := coalesce(v_previous_strength, 0);
  v_previous_attempts := coalesce(v_previous_attempts, 0);
  v_previous_correct := coalesce(v_previous_correct, 0);
  v_previous_streak := coalesce(v_previous_streak, 0);
  v_marker := null;

  insert into public.study_result_concept_updates (
    user_id,
    client_attempt_id,
    concept_id,
    class_id,
    answer_correct,
    confidence_level,
    recovered,
    previous_strength,
    evidence_contract_version,
    evidence_tier,
    target_task_kind
  ) values (
    v_user_id,
    p_attempt_id,
    p_concept_id,
    v_class_id,
    p_correct,
    p_confidence,
    p_recovered,
    v_previous_strength,
    v_contract_version,
    v_evidence_tier,
    v_target_task_kind
  )
  on conflict (user_id, client_attempt_id, concept_id) do nothing
  returning concept_id into v_marker;

  if v_marker is null then
    select update_row.previous_strength, update_row.resulting_strength
      into v_previous_strength, v_resulting_strength
    from public.study_result_concept_updates update_row
    where update_row.user_id = v_user_id
      and update_row.client_attempt_id = p_attempt_id
      and update_row.concept_id = p_concept_id;
    v_actual_delta := coalesce(v_resulting_strength, v_previous_strength) - v_previous_strength;
    return jsonb_build_object(
      'applied', false,
      'previousStrength', v_previous_strength,
      'resultingStrength', v_resulting_strength,
      'masteryDelta', v_actual_delta,
      'evidenceTier', v_evidence_tier,
      'targetTaskKind', v_target_task_kind
    );
  end if;

  -- Positive performance credit requires evidence at or above the task's
  -- minimum. Exposure and current post-reveal recall never earn positive
  -- performance mastery even when the student self-reports success.
  v_positive_credit := p_correct
    and v_evidence_rank >= v_required_rank
    and v_evidence_tier in ('discrimination', 'application', 'transfer');

  if not p_correct then
    v_requested_delta := case p_confidence
      when 'high' then -0.22
      when 'low' then -0.08
      else -0.10
    end;
    v_resulting_strength := greatest(0, v_previous_strength + v_requested_delta);
  elsif v_positive_credit then
    v_requested_delta := case p_confidence
      when 'high' then 0.18
      when 'low' then 0.10
      else 0.15
    end;
    -- A lower evidence tier may never erase stronger mastery already earned.
    v_resulting_strength := greatest(
      v_previous_strength,
      least(v_strength_ceiling, v_previous_strength + v_requested_delta)
    );
  else
    v_requested_delta := 0;
    v_resulting_strength := v_previous_strength;
  end if;

  v_actual_delta := v_resulting_strength - v_previous_strength;
  v_resulting_attempts := v_previous_attempts + 1;
  v_resulting_correct := v_previous_correct + case when p_correct then 1 else 0 end;
  v_resulting_streak := case
    when not p_correct then 0
    when v_positive_credit then v_previous_streak + 1
    else v_previous_streak
  end;
  v_next_hours := case
    when not p_correct and p_confidence = 'high' then 2
    when not p_correct then 4
    when not v_positive_credit then 8
    when p_confidence = 'low' then least(
      720::numeric,
      greatest(
        8::numeric,
        24 * power(2::numeric, least(10, greatest(0, v_resulting_streak - 1))) * 0.6
      )
    )::integer
    else least(
      720::numeric,
      24 * power(2::numeric, least(10, greatest(0, v_resulting_streak - 1)))
    )::integer
  end;

  insert into public.user_concept_mastery (
    user_id,
    concept_id,
    class_id,
    attempts,
    correct,
    strength,
    streak,
    last_seen_at,
    next_review_at
  ) values (
    v_user_id,
    p_concept_id,
    v_class_id,
    v_resulting_attempts,
    v_resulting_correct,
    v_resulting_strength,
    v_resulting_streak,
    p_seen_at,
    p_seen_at + make_interval(hours => v_next_hours)
  )
  on conflict (user_id, concept_id) do update set
    class_id = excluded.class_id,
    attempts = excluded.attempts,
    correct = excluded.correct,
    strength = excluded.strength,
    streak = excluded.streak,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at;

  update public.study_result_concept_updates update_row
    set resulting_strength = v_resulting_strength,
        applied_at = p_seen_at
  where update_row.user_id = v_user_id
    and update_row.client_attempt_id = p_attempt_id
    and update_row.concept_id = p_concept_id;

  return jsonb_build_object(
    'applied', true,
    'previousStrength', v_previous_strength,
    'resultingStrength', v_resulting_strength,
    'masteryDelta', v_actual_delta,
    'evidenceTier', v_evidence_tier,
    'targetTaskKind', v_target_task_kind
  );
end;
$$;

revoke all on function public.apply_study_concept_result_v3(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_study_concept_result_v3(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) to service_role;

comment on function public.apply_study_concept_result_v3(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) is
  'Service-only: applies idempotent contract-v2 mastery from the attempt ledger; post-reveal recall and below-task evidence earn no positive performance mastery, while misses remain negative.';

-- Contract-v2 Assignment Tutor reservation. This is intentionally a new RPC:
-- the old RPC remains available during the Edge rollout, while callers opt in
-- to frozen transfer/solve-problems evidence and v3 mastery atomically.
create or replace function public.reserve_practice_study_attempt_v2(
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
        'resultingStrength', v_existing_update.resulting_strength,
        'masteryDelta', v_existing_update.resulting_strength - v_existing_update.previous_strength
      );
    end if;

    if v_existing_attempt.evidence_contract_version is distinct from 2
        or v_existing_attempt.evidence_tier is distinct from 'transfer'
        or v_existing_attempt.target_task_kind is distinct from 'solve-problems' then
      return jsonb_build_object(
        'disposition', 'attempt-mismatch',
        'ownerAttemptId', p_client_attempt_id
      );
    end if;
    v_disposition := 'attempt-exists';
  else
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
          'resultingStrength', v_existing_update.resulting_strength,
          'masteryDelta', v_existing_update.resulting_strength - v_existing_update.previous_strength
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

  -- Keep the source-boundary lock order identical to the v1 reservation RPC.
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
      duration_seconds,
      evidence_contract_version,
      evidence_tier,
      target_task_kind
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
      p_duration_seconds,
      2,
      'transfer',
      'solve-problems'
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

  v_apply_result := public.apply_study_concept_result_v3(
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
    'resultingStrength', v_apply_result -> 'resultingStrength',
    'masteryDelta', v_apply_result -> 'masteryDelta',
    'evidenceTier', v_apply_result -> 'evidenceTier',
    'targetTaskKind', v_apply_result -> 'targetTaskKind'
  );
end;
$$;

revoke all on function public.reserve_practice_study_attempt_v2(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.reserve_practice_study_attempt_v2(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) to service_role;

comment on function public.reserve_practice_study_attempt_v2(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, integer
) is
  'Service-only: atomically reserves a verified Assignment Tutor transfer attempt under evidence contract v2 and applies tier-aware mastery once.';

comment on column public.study_result_attempts.evidence_contract_version is
  'NULL means legacy semantics; 2 means evidence_tier and target_task_kind were frozen from the server-owned artifact contract.';
comment on column public.study_result_attempts.evidence_tier is
  'Server-derived evidence strength: exposure, recall, discrimination, application, or transfer.';
comment on column public.study_result_attempts.target_task_kind is
  'Router-selected learning task frozen with the attempt; used to prevent a lower-skill format from claiming harder-task mastery.';
comment on column public.study_result_concept_updates.evidence_contract_version is
  'Immutable audit copy of the parent attempt evidence-contract version.';
comment on column public.study_result_concept_updates.evidence_tier is
  'Immutable audit copy of the parent attempt evidence tier.';
comment on column public.study_result_concept_updates.target_task_kind is
  'Immutable audit copy of the parent attempt target task.';
comment on column public.study_strategy_outcomes.evidence_contract_version is
  'NULL for feedback/legacy rows; 2 for a study-result row derived from a contract-v2 attempt.';
comment on column public.study_strategy_outcomes.evidence_tier is
  'Evidence strength inherited from a study-result attempt; always NULL for preference feedback.';

revoke all on function public.freeze_study_attempt_evidence_contract_v2()
  from public, anon, authenticated;
revoke all on function public.freeze_study_concept_update_evidence_contract_v2()
  from public, anon, authenticated;
revoke all on function public.freeze_strategy_outcome_evidence_contract_v2()
  from public, anon, authenticated;

-- One logical Study Runner session may contain several idempotent result
-- attempts. The parent ledger freezes ownership/artifact identity once, while
-- each child attempt keeps its own immutable mastery/idempotency contract.
create table if not exists public.study_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.learning_artifacts(id) on delete cascade,
  evidence_contract_version integer not null default 2,
  result_status text not null default 'processing',
  final_segment_index integer,
  session_id uuid unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_runs_owner_artifact_identity unique (id, user_id, artifact_id),
  constraint study_runs_contract_check check (evidence_contract_version = 2),
  constraint study_runs_status_check check (result_status in ('processing', 'completed')),
  constraint study_runs_final_segment_check check (
    final_segment_index is null or final_segment_index between 0 and 127
  ),
  constraint study_runs_session_identity_check check (
    session_id is null or session_id = id
  ),
  constraint study_runs_completion_check check (
    (result_status = 'completed' and final_segment_index is not null
      and session_id is not null and completed_at is not null)
    or (result_status = 'processing' and completed_at is null)
  )
);

alter table public.study_runs enable row level security;
revoke all on table public.study_runs from public, anon, authenticated;
grant all on table public.study_runs to service_role;

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_session_id_key;

alter table public.study_result_attempts
  add column if not exists study_run_id uuid,
  add column if not exists study_run_segment integer,
  add column if not exists study_run_final boolean,
  add column if not exists study_run_correct integer,
  add column if not exists study_run_total integer,
  add column if not exists study_run_concept_ids uuid[];

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_study_run_contract_check;

alter table public.study_result_attempts
  add constraint study_result_attempts_study_run_contract_check check (
    (
      study_run_id is null
      and study_run_segment is null
      and study_run_final is null
      and study_run_correct is null
      and study_run_total is null
      and study_run_concept_ids is null
    )
    or (
      study_run_id is not null
      and evidence_contract_version is not distinct from 2
      and study_run_segment is not null
      and study_run_segment between 0 and 127
      and study_run_final is not null
      and study_run_correct is not null
      and study_run_total is not null
      and study_run_concept_ids is not null
      and study_run_correct between 0 and study_run_total
      and study_run_total between 1 and 64
      and cardinality(study_run_concept_ids) = study_run_total
    )
  );

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_study_run_owner_artifact_fkey;

alter table public.study_result_attempts
  add constraint study_result_attempts_study_run_owner_artifact_fkey
  foreign key (study_run_id, user_id, artifact_id)
  references public.study_runs (id, user_id, artifact_id)
  on delete cascade;

create unique index if not exists study_result_attempts_run_segment_uidx
  on public.study_result_attempts (study_run_id, study_run_segment)
  where study_run_id is not null;

create unique index if not exists study_result_attempts_run_final_uidx
  on public.study_result_attempts (study_run_id)
  where study_run_id is not null and study_run_final = true;

alter table public.study_sessions
  add column if not exists study_run_id uuid;

create unique index if not exists study_sessions_study_run_uidx
  on public.study_sessions (study_run_id)
  where study_run_id is not null;

alter table public.study_sessions
  drop constraint if exists study_sessions_id_study_run_identity_key;

alter table public.study_sessions
  add constraint study_sessions_id_study_run_identity_key
  unique (id, study_run_id);

alter table public.study_sessions
  drop constraint if exists study_sessions_run_identity_check;

alter table public.study_sessions
  add constraint study_sessions_run_identity_check check (
    study_run_id is null or id = study_run_id
  );

alter table public.study_result_attempts
  drop constraint if exists study_result_attempts_run_session_fkey;

alter table public.study_result_attempts
  add constraint study_result_attempts_run_session_fkey
  foreign key (session_id, study_run_id)
  references public.study_sessions (id, study_run_id);

create or replace function public.enforce_study_run_attempt_contract_v2()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_run public.study_runs%rowtype;
  v_previous_status text;
  v_artifact_concept_ids uuid[];
  v_artifact_concept_count integer;
  v_artifact_distinct_count integer;
  v_segment_concept_count integer;
  v_segment_distinct_count integer;
  v_prior_declared_count integer;
  v_attempt_evidence_count integer;
  v_attempt_correct_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.study_run_id is distinct from old.study_run_id
       or new.study_run_segment is distinct from old.study_run_segment
       or new.study_run_final is distinct from old.study_run_final
       or new.study_run_correct is distinct from old.study_run_correct
       or new.study_run_total is distinct from old.study_run_total
       or new.study_run_concept_ids is distinct from old.study_run_concept_ids then
      raise exception 'study run attempt metadata is immutable';
    end if;
    if old.result_status = 'completed' and new.result_status <> 'completed' then
      raise exception 'completed study run segment is immutable';
    end if;
  end if;

  if new.study_run_id is null then
    return new;
  end if;

  -- Serialize fresh child reservations for this globally unique parent id.
  -- UPDATE already owns the attempt row; avoiding an advisory wait there keeps
  -- the lock order compatible with concept-evidence inserts.
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.study_run_id::text, 0));
  end if;

  select run.*
    into v_run
  from public.study_runs run
  where run.id = new.study_run_id
  for update;

  if not found
     or v_run.user_id is distinct from new.user_id
     or v_run.artifact_id is distinct from new.artifact_id
     or v_run.evidence_contract_version <> 2 then
    raise exception 'study run owner or artifact does not match';
  end if;
  if v_run.result_status = 'completed' then
    raise exception 'study run is already final';
  end if;

  if new.session_id is not null and new.session_id is distinct from new.study_run_id then
    raise exception 'study run attempt must use its grouped session';
  end if;
  if new.result_status = 'completed' and new.session_id is null then
    raise exception 'completed study run segment requires its grouped session';
  end if;

  select artifact.concept_ids into v_artifact_concept_ids
  from public.learning_artifacts artifact
  where artifact.id = new.artifact_id
    and artifact.user_id = new.user_id;
  select count(*), count(distinct segment_concept.concept_id)
    into v_segment_concept_count, v_segment_distinct_count
  from unnest(new.study_run_concept_ids) as segment_concept(concept_id);
  select count(*), count(distinct artifact_concept.concept_id)
    into v_artifact_concept_count, v_artifact_distinct_count
  from unnest(v_artifact_concept_ids) as artifact_concept(concept_id);
  if v_artifact_concept_ids is null
     or v_artifact_concept_count < 1
     or v_artifact_distinct_count <> v_artifact_concept_count
     or v_segment_concept_count <> new.study_run_total
     or v_segment_distinct_count <> v_segment_concept_count
     or exists (
       select 1
       from unnest(new.study_run_concept_ids) as segment_concept(concept_id)
       where not (segment_concept.concept_id = any(v_artifact_concept_ids))
     ) then
    raise exception 'study run segment concepts do not match its immutable artifact';
  end if;

  if tg_op = 'INSERT' and exists (
    select 1
    from public.study_result_attempts sibling
    where sibling.study_run_id = new.study_run_id
      and sibling.study_run_concept_ids && new.study_run_concept_ids
  ) then
    raise exception 'study run segment repeats concept evidence';
  end if;

  if tg_op = 'UPDATE' and new.result_status = 'completed' then
    select count(*), count(*) filter (where update_row.answer_correct)
      into v_attempt_evidence_count, v_attempt_correct_count
    from public.study_result_concept_updates update_row
    where update_row.user_id = new.user_id
      and update_row.client_attempt_id = new.client_attempt_id
      and update_row.concept_id = any(new.study_run_concept_ids);
    if v_attempt_evidence_count <> new.study_run_total
       or v_attempt_correct_count <> new.study_run_correct then
      raise exception 'study run segment cannot complete before its declared concept evidence';
    end if;
  end if;

  if tg_op = 'INSERT' and v_run.final_segment_index is not null then
    raise exception 'study run is already final';
  end if;

  if tg_op = 'INSERT' and new.study_run_segment = 0 then
    if exists (
      select 1 from public.study_result_attempts attempt
      where attempt.study_run_id = new.study_run_id
    ) then
      raise exception 'study run segment zero is already reserved';
    end if;
  elsif tg_op = 'INSERT' then
    select attempt.result_status
      into v_previous_status
    from public.study_result_attempts attempt
    where attempt.study_run_id = new.study_run_id
      and attempt.study_run_segment = new.study_run_segment - 1;
    if not found or v_previous_status <> 'completed' then
      raise exception 'study run segments must be contiguous and acknowledged';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(sum(cardinality(sibling.study_run_concept_ids)), 0)
      into v_prior_declared_count
    from public.study_result_attempts sibling
    where sibling.study_run_id = new.study_run_id;
    if new.study_run_final
       and v_prior_declared_count + v_segment_concept_count <> v_artifact_concept_count then
      raise exception 'final study run segment must cover every artifact concept exactly once';
    end if;
    if not new.study_run_final
       and v_prior_declared_count + v_segment_concept_count >= v_artifact_concept_count then
      raise exception 'complete artifact coverage must be marked as the final study run segment';
    end if;
  end if;

  if tg_op = 'INSERT' and new.study_run_final then
    update public.study_runs
    set final_segment_index = new.study_run_segment,
        updated_at = now()
    where id = new.study_run_id;
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_attempts_enforce_study_run_contract_v2
  on public.study_result_attempts;
create trigger study_result_attempts_enforce_study_run_contract_v2
before insert or update of
  study_run_id, study_run_segment, study_run_final, study_run_correct, study_run_total,
  study_run_concept_ids,
  session_id, result_status
on public.study_result_attempts
for each row execute function public.enforce_study_run_attempt_contract_v2();

-- A concept is one immutable evidence unit within a logical run. Serialize
-- concept-update inserts with segment reservations so two concurrent segments
-- cannot both claim the same concept.
create or replace function public.enforce_study_run_concept_evidence_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_artifact_id uuid;
  v_attempt_status text;
  v_attempt_concept_ids uuid[];
  v_artifact_concept_ids uuid[];
begin
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.client_attempt_id is distinct from old.client_attempt_id
    or new.concept_id is distinct from old.concept_id
  ) then
    raise exception 'study run concept evidence identity is immutable';
  end if;

  select attempt.study_run_id into v_run_id
  from public.study_result_attempts attempt
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id;
  if not found or v_run_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_run_id::text, 0));

  -- Re-read after acquiring the run lock; a completion may have committed
  -- while this trigger waited.
  select attempt.artifact_id, attempt.result_status, attempt.study_run_concept_ids
    into v_artifact_id, v_attempt_status, v_attempt_concept_ids
  from public.study_result_attempts attempt
  where attempt.user_id = new.user_id
    and attempt.client_attempt_id = new.client_attempt_id
    and attempt.study_run_id = v_run_id
  for share;
  if not found then
    raise exception 'study run attempt disappeared before concept evidence';
  end if;

  select artifact.concept_ids into v_artifact_concept_ids
  from public.learning_artifacts artifact
  where artifact.id = v_artifact_id
    and artifact.user_id = new.user_id;
  if not found
     or v_artifact_concept_ids is null
     or not (new.concept_id = any(v_artifact_concept_ids))
     or v_attempt_concept_ids is null
     or not (new.concept_id = any(v_attempt_concept_ids)) then
    raise exception 'study run concept is outside its immutable artifact scope';
  end if;

  if tg_op = 'INSERT'
     and v_attempt_status = 'completed'
     and not exists (
       select 1 from public.study_result_concept_updates existing
       where existing.user_id = new.user_id
         and existing.client_attempt_id = new.client_attempt_id
         and existing.concept_id = new.concept_id
     ) then
    raise exception 'completed study run concept evidence is immutable';
  end if;

  if exists (
    select 1
    from public.study_result_concept_updates existing
    join public.study_result_attempts sibling
      on sibling.user_id = existing.user_id
     and sibling.client_attempt_id = existing.client_attempt_id
    where sibling.study_run_id = v_run_id
      and existing.user_id = new.user_id
      and existing.concept_id = new.concept_id
      and existing.client_attempt_id <> new.client_attempt_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'study run concept evidence cannot appear in multiple segments';
  end if;
  return new;
end;
$$;

drop trigger if exists study_result_concept_updates_enforce_run_concept_v2
  on public.study_result_concept_updates;
create trigger study_result_concept_updates_enforce_run_concept_v2
before insert or update of user_id, client_attempt_id, concept_id
on public.study_result_concept_updates
for each row execute function public.enforce_study_run_concept_evidence_v2();

create or replace function public.study_run_has_exact_concept_evidence_v2(
  p_study_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact_concept_ids uuid[];
  v_artifact_count integer;
  v_artifact_distinct_count integer;
  v_segment_count integer;
  v_final_segment_index integer;
  v_evidence_count integer;
  v_evidence_distinct_count integer;
  v_all_evidence_in_scope boolean;
begin
  select artifact.concept_ids, run.final_segment_index
    into v_artifact_concept_ids, v_final_segment_index
  from public.study_runs run
  join public.learning_artifacts artifact
    on artifact.id = run.artifact_id
   and artifact.user_id = run.user_id
  where run.id = p_study_run_id;
  if not found or v_artifact_concept_ids is null or v_final_segment_index is null then
    return false;
  end if;

  select count(*), count(distinct artifact_concept.concept_id)
    into v_artifact_count, v_artifact_distinct_count
  from unnest(v_artifact_concept_ids) as artifact_concept(concept_id);
  if v_artifact_count < 1 or v_artifact_distinct_count <> v_artifact_count then
    return false;
  end if;

  select count(*) into v_segment_count
  from public.study_result_attempts attempt
  where attempt.study_run_id = p_study_run_id;
  if v_segment_count <> v_final_segment_index + 1 or exists (
    select 1
    from public.study_result_attempts attempt
    left join public.study_result_concept_updates update_row
      on update_row.user_id = attempt.user_id
     and update_row.client_attempt_id = attempt.client_attempt_id
    where attempt.study_run_id = p_study_run_id
    group by attempt.user_id, attempt.client_attempt_id, attempt.result_status,
             attempt.study_run_correct, attempt.study_run_total,
             attempt.study_run_concept_ids
    having attempt.result_status <> 'completed'
       or count(update_row.concept_id) <> attempt.study_run_total
       or count(update_row.concept_id) filter (where update_row.answer_correct)
          <> attempt.study_run_correct
       or count(update_row.concept_id) filter (
            where update_row.concept_id = any(attempt.study_run_concept_ids)
          ) <> attempt.study_run_total
  ) then
    return false;
  end if;

  select count(*), count(distinct update_row.concept_id),
         coalesce(bool_and(update_row.concept_id = any(v_artifact_concept_ids)), false)
    into v_evidence_count, v_evidence_distinct_count, v_all_evidence_in_scope
  from public.study_result_concept_updates update_row
  join public.study_result_attempts attempt
    on attempt.user_id = update_row.user_id
   and attempt.client_attempt_id = update_row.client_attempt_id
  where attempt.study_run_id = p_study_run_id;
  return v_evidence_count = v_artifact_count
    and v_evidence_distinct_count = v_artifact_count
    and v_all_evidence_in_scope;
end;
$$;

create or replace function public.freeze_study_run_identity_v2()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_artifact_user_id uuid;
  v_session_matches boolean;
  v_segment_count integer;
  v_completed_count integer;
  v_final_completed boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.artifact_id is distinct from old.artifact_id
       or new.evidence_contract_version is distinct from old.evidence_contract_version
       or (old.final_segment_index is not null
         and new.final_segment_index is distinct from old.final_segment_index)
       or (old.session_id is not null and new.session_id is distinct from old.session_id)
       or (old.result_status = 'completed' and (
         new.result_status <> 'completed'
         or new.completed_at is distinct from old.completed_at
       )) then
      raise exception 'study run identity and completed state are immutable';
    end if;
  end if;

  select artifact.user_id into v_artifact_user_id
  from public.learning_artifacts artifact
  where artifact.id = new.artifact_id;
  if not found or v_artifact_user_id is distinct from new.user_id then
    raise exception 'study run artifact owner does not match';
  end if;

  if new.session_id is not null then
    select exists (
      select 1 from public.study_sessions session
      where session.id = new.session_id
        and session.study_run_id = new.id
        and session.user_id = new.user_id
        and session.artifact_id = new.artifact_id
        and session.client_attempt_id = new.id
        and session.result_request_hash is null
        and (new.result_status <> 'completed' or session.result_status = 'completed')
    ) into v_session_matches;
    if not v_session_matches then
      raise exception 'study run session does not match';
    end if;
  end if;

  if new.result_status = 'completed' then
    select count(*),
           count(*) filter (where attempt.result_status = 'completed'),
           bool_or(
             attempt.study_run_segment = new.final_segment_index
             and attempt.study_run_final = true
             and attempt.result_status = 'completed'
             and attempt.session_id = new.session_id
           )
      into v_segment_count, v_completed_count, v_final_completed
    from public.study_result_attempts attempt
    where attempt.study_run_id = new.id;
    if new.session_id is null
       or new.final_segment_index is null
       or v_segment_count <> new.final_segment_index + 1
       or v_completed_count <> v_segment_count
       or not coalesce(v_final_completed, false)
       or not public.study_run_has_exact_concept_evidence_v2(new.id) then
      raise exception 'study run cannot complete before every segment and session are complete';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists study_runs_freeze_identity_v2 on public.study_runs;
create trigger study_runs_freeze_identity_v2
before insert or update on public.study_runs
for each row execute function public.freeze_study_run_identity_v2();

create or replace function public.enforce_study_session_run_identity_v2()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_run public.study_runs%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.study_run_id is not null
     and new.study_run_id is distinct from old.study_run_id then
    raise exception 'study session run identity is immutable';
  end if;
  if new.study_run_id is null then
    return new;
  end if;
  select run.* into v_run
  from public.study_runs run
  where run.id = new.study_run_id;
  if not found
     or new.id is distinct from v_run.id
     or new.user_id is distinct from v_run.user_id
     or new.artifact_id is distinct from v_run.artifact_id
     or new.client_attempt_id is distinct from v_run.id then
    raise exception 'study session does not match its parent run';
  end if;
  if new.result_status = 'completed'
     and not public.study_run_has_exact_concept_evidence_v2(new.study_run_id) then
    raise exception 'study session cannot complete before exact artifact concept coverage';
  end if;
  return new;
end;
$$;

drop trigger if exists study_sessions_enforce_run_identity_v2
  on public.study_sessions;
create trigger study_sessions_enforce_run_identity_v2
before insert or update of id, study_run_id, user_id, artifact_id, client_attempt_id,
  result_status
on public.study_sessions
for each row execute function public.enforce_study_session_run_identity_v2();

create or replace function public.cleanup_study_run_session_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.study_sessions session
  where session.study_run_id = old.id;
  return old;
end;
$$;

drop trigger if exists study_runs_cleanup_session_v2 on public.study_runs;
create trigger study_runs_cleanup_session_v2
after delete on public.study_runs
for each row execute function public.cleanup_study_run_session_v2();

comment on table public.study_runs is
  'Service-only parent ledger: one owner/artifact study run, many immutable incremental attempts, and one presentation session.';
comment on column public.study_result_attempts.study_run_id is
  'Contract-v2 parent id shared by serialized incremental attempts; NULL for legacy one-shot results.';
comment on column public.study_result_attempts.study_run_segment is
  'Immutable zero-based segment index within a study run.';
comment on column public.study_result_attempts.study_run_correct is
  'Server-validated first-attempt correct count for aggregate session projection.';
comment on column public.study_result_attempts.study_run_total is
  'Server-validated first-attempt total for aggregate session projection.';
comment on column public.study_result_attempts.study_run_concept_ids is
  'Immutable artifact concept set reserved by this segment before mastery is applied.';

revoke all on function public.enforce_study_run_attempt_contract_v2()
  from public, anon, authenticated;
revoke all on function public.enforce_study_run_concept_evidence_v2()
  from public, anon, authenticated;
revoke all on function public.study_run_has_exact_concept_evidence_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.study_run_has_exact_concept_evidence_v2(uuid)
  to service_role;
revoke all on function public.freeze_study_run_identity_v2()
  from public, anon, authenticated;
revoke all on function public.enforce_study_session_run_identity_v2()
  from public, anon, authenticated;
revoke all on function public.cleanup_study_run_session_v2()
  from public, anon, authenticated;

commit;
