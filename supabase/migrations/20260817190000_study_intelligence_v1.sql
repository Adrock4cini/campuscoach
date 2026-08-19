-- Study Intelligence v1
--
-- Adds confidence-calibrated mastery updates and a deliberately small,
-- owner-scoped feedback loop for memory techniques. Generated tricks remain
-- disposable learning artifacts; concepts and mastery remain the durable
-- academic memory.

alter table public.study_result_concept_updates
  add column if not exists confidence_level text,
  add column if not exists recovered boolean not null default false;

alter table public.study_sessions
  add column if not exists result_request_hash text;

alter table public.study_sessions
  drop constraint if exists study_sessions_result_request_hash_check;

alter table public.study_sessions
  add constraint study_sessions_result_request_hash_check
  check (result_request_hash is null or result_request_hash ~ '^[0-9a-f]{64}$');

alter table public.study_result_concept_updates
  drop constraint if exists study_result_concept_updates_confidence_check;

alter table public.study_result_concept_updates
  add constraint study_result_concept_updates_confidence_check
  check (confidence_level is null or confidence_level in ('low', 'medium', 'high'));

-- The browser-writable study_sessions relation remains presentation/history
-- storage for older study modes. Artifact result idempotency and leases must not
-- trust it, so keep the authoritative state in a backend-only ledger.
create table if not exists public.study_result_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id uuid not null,
  artifact_id uuid not null references public.learning_artifacts(id) on delete cascade,
  result_request_hash text not null,
  result_status text not null default 'processing',
  lease_token uuid not null,
  lease_started_at timestamptz not null default now(),
  duration_seconds integer not null,
  session_id uuid unique references public.study_sessions(id) on delete set null,
  result_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_attempt_id),
  constraint study_result_attempts_hash_check
    check (result_request_hash ~ '^[0-9a-f]{64}$'),
  constraint study_result_attempts_status_check
    check (result_status in ('processing', 'completed', 'failed')),
  constraint study_result_attempts_duration_check
    check (duration_seconds between 0 and 86400),
  constraint study_result_attempts_completion_check
    check (
      (result_status = 'completed' and result_payload is not null and completed_at is not null and session_id is not null)
      or (result_status <> 'completed' and completed_at is null)
    )
);

create index if not exists study_result_attempts_artifact_idx
  on public.study_result_attempts (user_id, artifact_id, created_at desc);

alter table public.study_result_attempts enable row level security;
revoke all on table public.study_result_attempts from public, anon, authenticated;
grant all on table public.study_result_attempts to service_role;

comment on table public.study_result_attempts is
  'Service-only lease and idempotency state for verified artifact results; study_sessions is presentation history only.';

-- Normalize capture routing without ever moving a capture across owners. A
-- forged class UUID is an optional association, so sever it (and its paired
-- client key) before resolving only same-owner identifiers.
update public.captures capture
set class_id = null,
    client_class_id = null
where capture.class_id is not null
  and not exists (
    select 1
      from public.classes owned_class
      where owned_class.id = capture.class_id
        and owned_class.user_id = capture.user_id
  );

update public.captures capture
set client_class_id = owned_class.client_class_id
from public.classes owned_class
where owned_class.id = capture.class_id
  and owned_class.user_id = capture.user_id
  and capture.client_class_id is distinct from owned_class.client_class_id;

update public.captures capture
set class_id = owned_class.id
from public.classes owned_class
where capture.class_id is null
  and capture.client_class_id is not null
  and owned_class.user_id = capture.user_id
  and owned_class.client_class_id = capture.client_class_id;

update public.captures capture
set client_class_id = null
where capture.class_id is null
  and capture.client_class_id is not null
  and not exists (
    select 1
      from public.classes owned_class
      where owned_class.user_id = capture.user_id
        and owned_class.client_class_id = capture.client_class_id
  );

-- Repair only clearly invalid optional links before enforcing the boundary for
-- every future concept write. We sever a cross-owner UUID association without
-- moving or reassigning the student's concept text; any same-owner ambiguity
-- fails below for an explicit operator review.
update public.concepts concept
set capture_id = null
where concept.capture_id is not null
  and not exists (
    select 1
      from public.captures capture
      where capture.id = concept.capture_id
        and capture.user_id = concept.user_id
  );

update public.concepts concept
set class_id = null
where concept.class_id is not null
  and not exists (
    select 1
      from public.classes owned_class
      where owned_class.id = concept.class_id
        and owned_class.user_id = concept.user_id
  );

-- For an owned source capture, fill only a missing concept class from the
-- already owner-verified capture. Non-null disagreements are ambiguous and are
-- rejected by the invariant block below instead of silently reassigned.
update public.concepts concept
set class_id = capture.class_id
from public.captures capture
where capture.id = concept.capture_id
  and capture.user_id = concept.user_id
  and capture.class_id is not null
  and concept.class_id is null
  and (
    concept.client_class_id is null
    or concept.client_class_id = capture.client_class_id
  );

update public.concepts concept
set client_class_id = capture.client_class_id
from public.captures capture
where capture.id = concept.capture_id
  and capture.user_id = concept.user_id
  and capture.client_class_id is not null
  and concept.client_class_id is null;

update public.concepts concept
set class_id = owned_class.id
from public.classes owned_class
where concept.class_id is null
  and concept.client_class_id is not null
  and owned_class.user_id = concept.user_id
  and owned_class.client_class_id = concept.client_class_id;

update public.concepts concept
set client_class_id = owned_class.client_class_id
from public.classes owned_class
where owned_class.id = concept.class_id
  and owned_class.user_id = concept.user_id
  and concept.client_class_id is distinct from owned_class.client_class_id;

-- A client-class routing key is optional. If it names no class owned by the
-- concept owner, remove only that invalid routing link; never map it to a class
-- merely because another account happens to use the same text.
update public.concepts concept
set client_class_id = null
where concept.client_class_id is not null
  and not exists (
    select 1
      from public.classes owned_class
      where owned_class.user_id = concept.user_id
        and owned_class.client_class_id = concept.client_class_id
  );

do $$
begin
  if exists (
    select 1
      from public.concepts concept
      join public.captures capture
        on capture.id = concept.capture_id
       and capture.user_id = concept.user_id
      where concept.class_id is not null
        and capture.class_id is not null
        and concept.class_id <> capture.class_id
  ) then
    raise exception 'Concept/capture class ambiguity requires owner-preserving repair before Study Intelligence rollout';
  end if;
  if exists (
    select 1
      from public.concepts concept
      join public.captures capture
        on capture.id = concept.capture_id
       and capture.user_id = concept.user_id
      where concept.client_class_id is not null
        and capture.client_class_id is not null
        and concept.client_class_id <> capture.client_class_id
  ) then
    raise exception 'Concept/capture client-class ambiguity requires owner-preserving repair before Study Intelligence rollout';
  end if;
  if exists (
    select 1
      from public.user_concept_mastery mastery
      join public.concepts concept on concept.id = mastery.concept_id
      where mastery.user_id <> concept.user_id
  ) then
    raise exception 'Cross-owner mastery/concept rows require explicit operator review before Study Intelligence rollout';
  end if;
  if exists (
    select 1
      from public.study_result_concept_updates update_row
      join public.concepts concept on concept.id = update_row.concept_id
      where update_row.user_id <> concept.user_id
  ) then
    raise exception 'Cross-owner result/concept rows require explicit operator review before Study Intelligence rollout';
  end if;
  if exists (
    select 1
      from public.captures capture
      left join public.classes owned_class
        on owned_class.id = capture.class_id
       and owned_class.user_id = capture.user_id
      where (capture.class_id is null) <> (capture.client_class_id is null)
         or (capture.class_id is not null and owned_class.id is null)
         or (
           owned_class.id is not null
           and capture.client_class_id is distinct from owned_class.client_class_id
         )
  ) then
    raise exception 'Capture class ownership invariant failed before Study Intelligence rollout';
  end if;
  if exists (
    select 1
      from public.concepts concept
      left join public.classes owned_class
        on owned_class.id = concept.class_id
       and owned_class.user_id = concept.user_id
      left join public.captures capture
        on capture.id = concept.capture_id
       and capture.user_id = concept.user_id
      where (concept.class_id is null) <> (concept.client_class_id is null)
         or (concept.class_id is not null and owned_class.id is null)
         or (
           owned_class.id is not null
           and concept.client_class_id is distinct from owned_class.client_class_id
         )
         or (concept.capture_id is not null and capture.id is null)
         or (
           capture.id is not null
           and capture.class_id is not null
           and (
             concept.class_id is distinct from capture.class_id
             or concept.client_class_id is distinct from capture.client_class_id
           )
         )
  ) then
    raise exception 'Concept owner/class/capture invariant failed before Study Intelligence rollout';
  end if;
end;
$$;

-- The concept is the canonical owner-checked class link. Scrub stale mastery
-- and result-ledger class values to that exact value (including NULL) so a
-- previously forged class cannot survive an otherwise valid concept row.
update public.user_concept_mastery mastery
set class_id = concept.class_id
from public.concepts concept
where concept.id = mastery.concept_id
  and concept.user_id = mastery.user_id
  and mastery.class_id is distinct from concept.class_id;

update public.study_result_concept_updates update_row
set class_id = concept.class_id
from public.concepts concept
where concept.id = update_row.concept_id
  and concept.user_id = update_row.user_id
  and update_row.class_id is distinct from concept.class_id;

create or replace function public.enforce_concept_owner_boundaries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_class_owner uuid;
  v_class_client_id text;
  v_capture_owner uuid;
  v_capture_class_id uuid;
  v_capture_client_id text;
  v_resolved_class_id uuid;
begin
  if new.capture_id is not null then
    select capture.user_id, capture.class_id, capture.client_class_id
      into v_capture_owner, v_capture_class_id, v_capture_client_id
      from public.captures capture
      where capture.id = new.capture_id
      for share;
    if v_capture_owner is null or v_capture_owner <> new.user_id then
      raise exception 'Capture does not belong to concept owner';
    end if;
    if v_capture_class_id is not null then
      if new.class_id is null then
        new.class_id := v_capture_class_id;
      elsif new.class_id <> v_capture_class_id then
        raise exception 'Concept class does not match capture class';
      end if;
    end if;
    if v_capture_client_id is not null then
      if new.client_class_id is null then
        new.client_class_id := v_capture_client_id;
      elsif new.client_class_id <> v_capture_client_id then
        raise exception 'Concept client class does not match capture class';
      end if;
    end if;
  end if;

  if new.class_id is not null then
    select owned_class.user_id, owned_class.client_class_id
      into v_class_owner, v_class_client_id
      from public.classes owned_class
      where owned_class.id = new.class_id;
    if v_class_owner is null or v_class_owner <> new.user_id then
      raise exception 'Class does not belong to concept owner';
    end if;
    if new.client_class_id is null then
      new.client_class_id := v_class_client_id;
    elsif new.client_class_id <> v_class_client_id then
      raise exception 'Concept class identifiers do not match';
    end if;
  elsif new.client_class_id is not null then
    select owned_class.id, owned_class.user_id
      into v_resolved_class_id, v_class_owner
      from public.classes owned_class
      where owned_class.user_id = new.user_id
        and owned_class.client_class_id = new.client_class_id;
    if v_resolved_class_id is null or v_class_owner <> new.user_id then
      raise exception 'Client class does not belong to concept owner';
    end if;
    new.class_id := v_resolved_class_id;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_concept_owner_boundaries
  on public.concepts;
create trigger enforce_concept_owner_boundaries
before insert or update of user_id, class_id, client_class_id, capture_id
on public.concepts
for each row execute function public.enforce_concept_owner_boundaries();

revoke all on function public.enforce_concept_owner_boundaries()
  from public, anon, authenticated;
grant execute on function public.enforce_concept_owner_boundaries()
  to service_role;

-- Capture ownership must remain coherent after rollout as well. In particular,
-- a later class reclassification cannot strand already-extracted concepts in a
-- different class.
create or replace function public.enforce_capture_study_boundaries()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_owner uuid;
  v_client_class_id text;
  v_class_id uuid;
begin
  if new.class_id is not null then
    select owned_class.user_id, owned_class.client_class_id
      into v_owner, v_client_class_id
      from public.classes owned_class
      where owned_class.id = new.class_id;
    if v_owner is null or v_owner <> new.user_id then
      raise exception 'Capture class must belong to capture owner';
    end if;
    if new.client_class_id is null then
      new.client_class_id := v_client_class_id;
    elsif new.client_class_id <> v_client_class_id then
      raise exception 'Capture class identifiers do not match';
    end if;
  elsif new.client_class_id is not null then
    select owned_class.id, owned_class.user_id
      into v_class_id, v_owner
      from public.classes owned_class
      where owned_class.user_id = new.user_id
        and owned_class.client_class_id = new.client_class_id;
    if v_class_id is null or v_owner <> new.user_id then
      raise exception 'Capture client class must belong to capture owner';
    end if;
    new.class_id := v_class_id;
  end if;

  if new.assignment_id is not null then
    select assignment.user_id, assignment.client_class_id, assignment.class_id
      into v_owner, v_client_class_id, v_class_id
      from public.assignments assignment
      where assignment.id = new.assignment_id;
    if v_owner is null
       or v_owner <> new.user_id
       or v_client_class_id is distinct from new.client_class_id
       or (v_class_id is not null and v_class_id is distinct from new.class_id) then
      raise exception 'Assignment must belong to the capture owner and class';
    end if;
  end if;

  if new.exam_id is not null then
    select exam.user_id, exam.client_class_id, exam.class_id
      into v_owner, v_client_class_id, v_class_id
      from public.exams exam
      where exam.id = new.exam_id;
    if v_owner is null
       or v_owner <> new.user_id
       or v_client_class_id is distinct from new.client_class_id
       or (v_class_id is not null and v_class_id is distinct from new.class_id) then
      raise exception 'Exam must belong to the capture owner and class';
    end if;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
      from public.concepts concept
      where concept.capture_id = new.id
        and new.class_id is not null
        and (
          concept.user_id is distinct from new.user_id
          or concept.class_id is distinct from new.class_id
          or concept.client_class_id is distinct from new.client_class_id
        )
  ) then
    raise exception 'Capture class cannot diverge from its extracted concepts';
  end if;

  return new;
end;
$$;

-- 20260722120000 installs this trigger. Recreate it explicitly so the upgraded
-- function contract is attached even if an environment drifted; the migration
-- fails closed if the prerequisite captures table is absent.
drop trigger if exists captures_enforce_study_boundaries
  on public.captures;
create trigger captures_enforce_study_boundaries
before insert or update of user_id, client_class_id, class_id, assignment_id, exam_id
on public.captures
for each row execute function public.enforce_capture_study_boundaries();

revoke all on function public.enforce_capture_study_boundaries()
  from public, anon, authenticated;

create or replace function public.apply_study_concept_result_v2(
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
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := p_user_id;
  v_marker uuid;
  v_class_id uuid;
  v_previous_strength real := 0;
  v_previous_attempts integer := 0;
  v_previous_correct integer := 0;
  v_previous_streak integer := 0;
  v_resulting_strength real;
  v_resulting_attempts integer;
  v_resulting_correct integer;
  v_resulting_streak integer;
  v_next_hours integer;
  v_delta real;
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

  -- The concept row provides a stable owner-checked lock even when an older
  -- capture is missing its seeded mastery row.
  select concept.id, concept.class_id
    into v_marker, v_class_id
    from public.concepts concept
    where concept.id = p_concept_id and concept.user_id = v_user_id
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
    where mastery.user_id = v_user_id and mastery.concept_id = p_concept_id
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
    previous_strength
  ) values (
    v_user_id,
    p_attempt_id,
    p_concept_id,
    v_class_id,
    p_correct,
    p_confidence,
    p_recovered,
    v_previous_strength
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
    return jsonb_build_object(
      'applied', false,
      'previousStrength', v_previous_strength,
      'resultingStrength', v_resulting_strength
    );
  end if;

  -- Only first-attempt correctness affects mastery. p_recovered records that
  -- the student learned it on the retry, but never converts the miss to credit.
  v_delta := case
    when p_correct and p_confidence = 'high' then 0.18
    when p_correct and p_confidence = 'low' then 0.10
    when p_correct then 0.15
    when p_confidence = 'high' then -0.22
    when p_confidence = 'low' then -0.08
    else -0.10
  end;
  v_resulting_attempts := v_previous_attempts + 1;
  v_resulting_correct := v_previous_correct + case when p_correct then 1 else 0 end;
  v_resulting_strength := greatest(0, least(1, v_previous_strength + v_delta));
  v_resulting_streak := case when p_correct then v_previous_streak + 1 else 0 end;
  v_next_hours := case
    when not p_correct and p_confidence = 'high' then 2
    when not p_correct then 4
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
    'resultingStrength', v_resulting_strength
  );
end;
$$;

revoke all on function public.apply_study_concept_result_v2(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_study_concept_result_v2(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) to service_role;

comment on function public.apply_study_concept_result_v2(
  uuid, uuid, uuid, uuid, boolean, text, boolean, timestamptz
) is 'Service-only: idempotently applies a verified first-attempt result with pre-reveal confidence; recovery is recorded without mastery credit.';

create table if not exists public.study_memory_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.learning_artifacts(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  technique text not null,
  helpful boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, artifact_id, concept_id),
  constraint study_memory_feedback_technique_check check (
    technique in ('acronym', 'association', 'rhyme', 'story', 'chunking', 'visual', 'other')
  )
);

create index if not exists study_memory_feedback_user_technique_idx
  on public.study_memory_feedback (user_id, technique, helpful);

alter table public.study_memory_feedback enable row level security;

revoke all on table public.study_memory_feedback from public, anon, authenticated;
grant all on public.study_memory_feedback to service_role;

create or replace function public.record_memory_trick_feedback(
  p_artifact_id uuid,
  p_concept_id uuid,
  p_technique text,
  p_helpful boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_technique not in ('acronym', 'association', 'rhyme', 'story', 'chunking', 'visual', 'other') then
    raise exception 'Invalid memory technique';
  end if;
  if not exists (
    select 1
      from public.learning_artifacts artifact
      join public.concepts concept
        on concept.id = p_concept_id
       and concept.user_id = v_user_id
      where artifact.id = p_artifact_id
        and artifact.user_id = v_user_id
        and artifact.kind = 'mnemonic'
        and artifact.stale is false
        and p_concept_id = any(artifact.concept_ids)
        and exists (
          select 1
            from jsonb_array_elements(coalesce(artifact.payload -> 'items', '[]'::jsonb)) item
            where item ->> 'conceptId' = p_concept_id::text
              and item ->> 'technique' = p_technique
        )
  ) then
    raise exception 'Memory trick does not match this concept';
  end if;

  insert into public.study_memory_feedback (
    user_id, artifact_id, concept_id, technique, helpful
  ) values (
    v_user_id, p_artifact_id, p_concept_id, p_technique, p_helpful
  )
  on conflict (user_id, artifact_id, concept_id) do update set
    technique = excluded.technique,
    helpful = excluded.helpful,
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.record_memory_trick_feedback(uuid, uuid, text, boolean)
  to authenticated, service_role;

comment on table public.study_memory_feedback is
  'Minimal owner-scoped feedback used to prefer memory-technique categories; stores no student text.';
