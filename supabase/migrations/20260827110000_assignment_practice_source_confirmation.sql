-- A photographed assignment is untrusted OCR until the student confirms the
-- exact problem text. Keep OCR in raw_text for audit; Tutor reads only the
-- separately versioned, confirmed practice source.

alter table public.captures
  add column if not exists practice_source_status text not null default 'not_required',
  add column if not exists practice_source_text text,
  add column if not exists practice_source_version integer not null default 0,
  add column if not exists practice_source_hash text,
  add column if not exists practice_source_confirmed_at timestamptz,
  add column if not exists practice_concept_id uuid references public.concepts(id) on delete set null;

-- New deterministic concepts carry an explicit identity key. The ordinary
-- extractor still performs conservative semantic matching, while this unique
-- boundary prevents two concurrent capture confirmations from creating two
-- mastery concepts for the same class skill.
alter table public.concepts
  add column if not exists identity_key text,
  add column if not exists retired_at timestamptz;

create unique index if not exists concepts_owner_class_identity_uidx
  on public.concepts (user_id, class_id, identity_key);

alter table public.captures
  drop constraint if exists captures_practice_source_status_check;
alter table public.captures
  add constraint captures_practice_source_status_check
  check (practice_source_status in ('not_required', 'processing', 'needs_review', 'confirmed'));

alter table public.captures
  drop constraint if exists captures_practice_source_version_check;
alter table public.captures
  add constraint captures_practice_source_version_check
  check (practice_source_version >= 0);

alter table public.captures
  drop constraint if exists captures_practice_source_shape_check;
alter table public.captures
  add constraint captures_practice_source_shape_check
  check (
    case practice_source_status
      when 'confirmed' then
        practice_source_text is not null
        and length(practice_source_text) between 1 and 360
        and btrim(practice_source_text) = practice_source_text
        and practice_source_version > 0
        and practice_source_hash ~ '^[0-9a-f]{64}$'
        and practice_source_confirmed_at is not null
        and practice_concept_id is not null
      when 'needs_review' then
        (practice_source_text is null or (
          length(practice_source_text) between 1 and 360
          and btrim(practice_source_text) = practice_source_text
        ))
        and practice_source_hash is null
        and practice_source_confirmed_at is null
        and practice_concept_id is null
      else
        practice_source_text is null
        and practice_source_hash is null
        and practice_source_confirmed_at is null
        and practice_concept_id is null
    end
  );

-- Never silently trust historical OCR. Existing assignment photos must be
-- reviewed; a short OCR string is only a candidate for the student to inspect.
update public.captures
set
  practice_source_status = case
    when processing_status = 'processing' then 'processing'
    else 'needs_review'
  end,
  practice_source_text = case
    when processing_status <> 'processing'
      and length(btrim(coalesce(raw_text, ''))) between 1 and 360
      then btrim(raw_text)
    else null
  end,
  practice_source_version = greatest(practice_source_version, 1),
  practice_source_hash = null,
  practice_source_confirmed_at = null,
  practice_concept_id = null,
  flashcards_ready = false
where kind = 'scan-assignment';

-- The preceding evidence migration intentionally preserved every historical
-- concept/capture link. Assignment OCR is the exception: it was never
-- student-confirmed, so it must not remain active merely because an older
-- extractor persisted it. Preserve mastery and attempt history, but remove the
-- untrusted occurrence, re-anchor shared concepts to trusted captures, retire
-- assignment-only concepts, and invalidate anything derived from them.
create temporary table assignment_ocr_quarantine on commit drop as
select distinct
  evidence.user_id,
  evidence.concept_id,
  concept.class_id,
  evidence.capture_id
from public.concept_capture_evidence evidence
join public.captures capture
  on capture.id = evidence.capture_id
 and capture.user_id = evidence.user_id
join public.concepts concept
  on concept.id = evidence.concept_id
 and concept.user_id = evidence.user_id
where capture.kind = 'scan-assignment';

delete from public.concept_capture_evidence evidence
using assignment_ocr_quarantine quarantined
where evidence.user_id = quarantined.user_id
  and evidence.concept_id = quarantined.concept_id
  and evidence.capture_id = quarantined.capture_id;

update public.concepts concept
set capture_id = (
  select evidence.capture_id
  from public.concept_capture_evidence evidence
  where evidence.user_id = concept.user_id
    and evidence.concept_id = concept.id
  order by evidence.created_at asc, evidence.capture_id asc
  limit 1
)
where exists (
  select 1
  from assignment_ocr_quarantine quarantined
  where quarantined.user_id = concept.user_id
    and quarantined.concept_id = concept.id
)
and exists (
  select 1
  from public.captures capture
  where capture.id = concept.capture_id
    and capture.user_id = concept.user_id
    and capture.kind = 'scan-assignment'
);

update public.concepts concept
set retired_at = now()
where exists (
  select 1
  from assignment_ocr_quarantine quarantined
  where quarantined.user_id = concept.user_id
    and quarantined.concept_id = concept.id
)
and not exists (
  select 1
  from public.concept_capture_evidence evidence
  where evidence.user_id = concept.user_id
    and evidence.concept_id = concept.id
);

update public.learning_artifacts artifact
set stale = true
where artifact.stale = false
  and (
    exists (
      select 1
      from assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
    or exists (
      select 1
      from public.captures capture
      where capture.id = artifact.capture_id
        and capture.user_id = artifact.user_id
        and capture.kind = 'scan-assignment'
    )
  );

-- Freeze the exact unsafe artifact/attempt set before deleting presentation
-- rows. Completed attempts and sessions are immutable audit history. A
-- processing or failed reservation must be removed, however, or the retry path
-- could treat it as prior work and bypass the new retired/stale-source gates.
create temporary table assignment_ocr_unsafe_artifacts on commit drop as
select distinct artifact.user_id, artifact.id as artifact_id
from public.learning_artifacts artifact
where
  exists (
    select 1
    from assignment_ocr_quarantine quarantined
    join public.concepts concept
      on concept.id = quarantined.concept_id
     and concept.user_id = quarantined.user_id
     and concept.retired_at is not null
    where quarantined.user_id = artifact.user_id
      and quarantined.concept_id = any(artifact.concept_ids)
  )
  or exists (
    select 1
    from public.captures capture
    where capture.id = artifact.capture_id
      and capture.user_id = artifact.user_id
      and capture.kind = 'scan-assignment'
  );

create temporary table assignment_ocr_attempt_quarantine on commit drop as
select
  attempt.user_id,
  attempt.client_attempt_id,
  attempt.artifact_id,
  attempt.session_id
from public.study_result_attempts attempt
join assignment_ocr_unsafe_artifacts artifact
  on artifact.user_id = attempt.user_id
 and artifact.artifact_id = attempt.artifact_id
where attempt.result_status <> 'completed';

-- Historical assignment-derived scores cannot be separated reliably from
-- trusted attempts once they were folded into the aggregate mastery row.
-- Confirmation/exposure is not demonstrated learning. Reset every concept
-- touched by unconfirmed assignment OCR to neutral zero evidence; immutable
-- attempt/session ledgers remain available for audit, while future verified
-- retrieval/application can rebuild mastery honestly.
update public.user_concept_mastery mastery
set strength = 0,
    attempts = 0,
    correct = 0,
    streak = 0,
    last_seen_at = null,
    next_review_at = now(),
    updated_at = now()
where exists (
  select 1
  from assignment_ocr_quarantine quarantined
  where quarantined.user_id = mastery.user_id
    and quarantined.concept_id = mastery.concept_id
);

delete from public.study_strategy_outcomes outcome
using public.learning_artifacts artifact
where outcome.user_id = artifact.user_id
  and outcome.artifact_id = artifact.id
  and (
    exists (
      select 1
      from assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
    or exists (
      select 1
      from public.captures capture
      where capture.id = artifact.capture_id
        and capture.user_id = artifact.user_id
        and capture.kind = 'scan-assignment'
    )
  );

delete from public.topic_signals signal
using public.study_sessions session, public.learning_artifacts artifact
where signal.user_id = session.user_id
  and signal.source_type = 'study-session'
  and signal.source_id = session.id::text
  and session.artifact_id = artifact.id
  and session.user_id = artifact.user_id
  and (
    exists (
      select 1
      from assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
    or exists (
      select 1
      from public.captures capture
      where capture.id = artifact.capture_id
        and capture.user_id = artifact.user_id
        and capture.kind = 'scan-assignment'
    )
  );

delete from public.study_sessions session
using assignment_ocr_attempt_quarantine quarantined
where session.user_id = quarantined.user_id
  and (
    (quarantined.session_id is not null and session.id = quarantined.session_id)
    or (
      session.client_attempt_id = quarantined.client_attempt_id
      and session.artifact_id = quarantined.artifact_id
    )
  )
  and session.result_status in ('processing', 'failed');

delete from public.study_result_attempts attempt
using assignment_ocr_attempt_quarantine quarantined
where attempt.user_id = quarantined.user_id
  and attempt.client_attempt_id = quarantined.client_attempt_id
  and attempt.artifact_id = quarantined.artifact_id
  and attempt.result_status <> 'completed';

-- Legacy processed summaries/cards/quizzes were authored directly from OCR
-- and have no confirmation snapshot to validate. The raw capture remains for
-- audit and re-review; unsafe derivatives are discarded.
delete from public.processed_content processed
using public.captures capture
where processed.user_id = capture.user_id
  and processed.capture_id = capture.id
  and capture.kind = 'scan-assignment';

delete from public.flashcards card
using public.captures capture
where card.user_id = capture.user_id
  and card.capture_id = capture.id
  and capture.kind = 'scan-assignment';

delete from public.quizzes quiz
using public.captures capture
where quiz.user_id = capture.user_id
  and quiz.capture_id = capture.id
  and capture.kind = 'scan-assignment';

delete from public.readiness_scores score
where exists (
  select 1
  from assignment_ocr_quarantine quarantined
  where quarantined.user_id = score.user_id
    and quarantined.class_id is not distinct from score.class_id
);

update public.classes class
set readiness = coalesce((
      select round(avg(
        greatest(0::real, least(1::real, mastery.strength))
      ) * 100)::integer
      from public.concepts concept
      join public.user_concept_mastery mastery
        on mastery.user_id = concept.user_id
       and mastery.concept_id = concept.id
      where concept.user_id = class.user_id
        and concept.class_id = class.id
        and concept.retired_at is null
    ), 0),
    updated_at = now()
where exists (
  select 1
  from assignment_ocr_quarantine quarantined
  where quarantined.user_id = class.user_id
    and quarantined.class_id is not distinct from class.id
);

update public.exams exam
set readiness = 0,
    updated_at = now()
where exam.source_archived_at is null
  and exists (
    select 1
    from assignment_ocr_quarantine quarantined
    where quarantined.user_id = exam.user_id
      and quarantined.class_id is not distinct from exam.class_id
  );

-- These new fields are protected as soon as the additive migration lands. A
-- later rollout migration locks every capture mutation after compatible
-- service-role workers have been deployed.
create or replace function public.protect_assignment_practice_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
      and (
        (tg_op = 'INSERT' and (
          new.practice_source_status <> 'not_required'
          or new.practice_source_text is not null
          or new.practice_source_version <> 0
          or new.practice_source_hash is not null
          or new.practice_source_confirmed_at is not null
          or new.practice_concept_id is not null
        ))
        or
        (tg_op = 'UPDATE' and (
          old.practice_source_status is distinct from new.practice_source_status
          or old.practice_source_text is distinct from new.practice_source_text
          or old.practice_source_version is distinct from new.practice_source_version
          or old.practice_source_hash is distinct from new.practice_source_hash
          or old.practice_source_confirmed_at is distinct from new.practice_source_confirmed_at
          or old.practice_concept_id is distinct from new.practice_concept_id
        ))
      ) then
    raise exception using
      errcode = '42501',
      message = 'practice source may only be changed by the server';
  end if;
  return new;
end;
$$;

-- Insert the deterministic Tutor artifact while holding the same capture row
-- lock used by confirmation. If confirmation commits first, this fails the
-- version boundary; if insertion commits first, confirmation's stale sweep
-- necessarily sees the new row.
create or replace function public.insert_confirmed_assignment_practice_artifact(
  p_user_id uuid,
  p_capture_id uuid,
  p_source_version integer,
  p_source_hash text,
  p_concept_id uuid,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capture public.captures%rowtype;
  v_assignment public.assignments%rowtype;
  v_inserted public.learning_artifacts%rowtype;
  v_snapshot jsonb;
begin
  if p_user_id is null
      or p_capture_id is null
      or p_source_version is null
      or p_source_version < 1
      or p_source_hash is null
      or p_source_hash !~ '^[0-9a-f]{64}$'
      or p_concept_id is null
      or p_artifact is null
      or jsonb_typeof(p_artifact) is distinct from 'object'
      or p_artifact ->> 'kind' is distinct from 'practice'
      or p_artifact ->> 'capture_id' is distinct from p_capture_id::text
      or jsonb_typeof(p_artifact -> 'concept_ids') is distinct from 'array'
      or (case
        when jsonb_typeof(p_artifact -> 'concept_ids') = 'array'
          then jsonb_array_length(p_artifact -> 'concept_ids') <> 1
        else true
      end)
      or p_artifact -> 'concept_ids' ->> 0 is distinct from p_concept_id::text
      or jsonb_typeof(p_artifact -> 'study_scope_snapshot') is distinct from 'object'
      or jsonb_typeof(p_artifact -> 'payload') is distinct from 'object'
      or jsonb_typeof(p_artifact -> 'payload' -> 'problems') is distinct from 'array'
      or (case
        when jsonb_typeof(p_artifact -> 'payload' -> 'problems') = 'array'
          then jsonb_array_length(p_artifact -> 'payload' -> 'problems') <> 1
        else true
      end)
      or coalesce(p_artifact ->> 'study_scope_type', '') not in ('recent', 'exam', 'class')
      or coalesce(p_artifact ->> 'study_scope_id', '') = ''
      or coalesce(p_artifact ->> 'prompt_version', '') = '' then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  v_snapshot := p_artifact -> 'study_scope_snapshot';
  select capture.*
    into v_capture
  from public.captures capture
  where capture.id = p_capture_id
    and capture.user_id = p_user_id
  for share;

  if not found then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  select assignment.*
    into v_assignment
  from public.assignments assignment
  where assignment.id = v_capture.assignment_id
    and assignment.user_id = p_user_id
    and assignment.source_archived_at is null
  for share;

  if not found
      or v_capture.kind <> 'scan-assignment'
      or v_capture.processing_status <> 'ready'
      or v_capture.concept_extraction_claim_id is not null
      or v_capture.practice_source_status <> 'confirmed'
      or v_capture.practice_source_version is distinct from p_source_version
      or v_capture.practice_source_hash is distinct from p_source_hash
      or v_capture.practice_concept_id is distinct from p_concept_id
      or v_capture.assignment_id is null
      or v_assignment.id is distinct from v_capture.assignment_id
      or v_assignment.class_id is distinct from v_capture.class_id
      or v_assignment.client_class_id is distinct from v_capture.client_class_id
      or p_artifact ->> 'class_id' is distinct from v_capture.class_id::text
      or p_artifact ->> 'client_class_id' is distinct from v_capture.client_class_id
      or v_snapshot ->> 'intent' is distinct from 'assignment-help'
      or v_snapshot ->> 'captureId' is distinct from p_capture_id::text
      or v_snapshot ->> 'assignmentId' is distinct from v_capture.assignment_id::text
      or v_snapshot ->> 'practiceSourceVersion' is distinct from p_source_version::text
      or v_snapshot ->> 'practiceSourceHash' is distinct from p_source_hash
      or v_snapshot ->> 'practiceConceptId' is distinct from p_concept_id::text
      or p_artifact -> 'payload' -> 'problems' -> 0 ->> 'conceptId' is distinct from p_concept_id::text
      or p_artifact -> 'payload' -> 'problems' -> 0 ->> 'sourceExcerpt' is distinct from v_capture.practice_source_text
      or not exists (
        select 1
        from public.concept_capture_evidence evidence
        join public.concepts concept
          on concept.id = evidence.concept_id
         and concept.user_id = evidence.user_id
         and concept.retired_at is null
        where evidence.user_id = p_user_id
          and evidence.concept_id = p_concept_id
          and evidence.capture_id = p_capture_id
      ) then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  insert into public.learning_artifacts (
    user_id, class_id, client_class_id, kind, concept_ids, capture_id,
    topic, study_scope_type, study_scope_id, study_scope_label,
    study_scope_snapshot, payload, model, prompt_version
  ) values (
    p_user_id,
    p_artifact ->> 'class_id',
    p_artifact ->> 'client_class_id',
    'practice'::public.artifact_kind,
    array[p_concept_id],
    p_capture_id,
    p_artifact ->> 'topic',
    p_artifact ->> 'study_scope_type',
    p_artifact ->> 'study_scope_id',
    p_artifact ->> 'study_scope_label',
    v_snapshot,
    p_artifact -> 'payload',
    p_artifact ->> 'model',
    p_artifact ->> 'prompt_version'
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'disposition', 'inserted',
    'artifact', to_jsonb(v_inserted)
  );
end;
$$;

drop trigger if exists captures_protect_assignment_practice_source on public.captures;
create trigger captures_protect_assignment_practice_source
before insert or update on public.captures
for each row execute function public.protect_assignment_practice_source();

create or replace function public.confirm_assignment_practice_source(
  p_user_id uuid,
  p_capture_id uuid,
  p_assignment_id uuid,
  p_client_class_id text,
  p_expected_version integer,
  p_source_text text,
  p_source_hash text,
  p_concept_identity_key text,
  p_concept_name text,
  p_concept_definition text,
  p_concept_example text,
  p_concept_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capture public.captures%rowtype;
  v_assignment public.assignments%rowtype;
  v_next_version integer;
  v_practice_concept_id uuid;
  v_previous_concept_id uuid;
  v_has_trusted_evidence boolean := false;
begin
  if p_user_id is null
      or p_capture_id is null
      or p_assignment_id is null
      or p_client_class_id is null
      or p_expected_version is null
      or p_expected_version < 0
      or p_source_text is null
      or length(p_source_text) not between 1 and 360
      or btrim(p_source_text) <> p_source_text
      or p_source_hash is null
      or p_source_hash !~ '^[0-9a-f]{64}$'
      or p_concept_identity_key is null
      or length(p_concept_identity_key) not between 1 and 200
      or p_concept_name is null
      or length(p_concept_name) not between 1 and 180
      or p_concept_definition is null
      or length(p_concept_definition) not between 1 and 2000
      or p_concept_example is distinct from p_source_text
      or p_concept_slug is null
      or length(p_concept_slug) not between 1 and 80 then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  select capture.*
    into v_capture
  from public.captures capture
  where capture.id = p_capture_id
    and capture.user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('disposition', 'not-found');
  end if;

  v_previous_concept_id := v_capture.practice_concept_id;

  select assignment.*
    into v_assignment
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and assignment.user_id = p_user_id
    and assignment.source_archived_at is null
  for share;

  if not found
      or v_capture.kind <> 'scan-assignment'
      or v_capture.processing_status <> 'ready'
      or v_capture.concept_extraction_claim_id is not null
      or v_capture.class_id is null
      or v_capture.assignment_id is distinct from v_assignment.id
      or v_capture.class_id is distinct from v_assignment.class_id
      or v_capture.client_class_id is distinct from v_assignment.client_class_id
      or v_capture.client_class_id is distinct from p_client_class_id then
    return jsonb_build_object('disposition', 'boundary-mismatch');
  end if;

  -- A timed-out client may repeat the same confirmation after the original
  -- transaction committed. Converge without creating another version.
  if v_capture.practice_source_status = 'confirmed'
      and v_capture.practice_source_text = p_source_text
      and v_capture.practice_source_hash = p_source_hash then
    return jsonb_build_object(
      'disposition', 'confirmed',
      'idempotent', true,
      'version', v_capture.practice_source_version,
      'hash', v_capture.practice_source_hash,
      'confirmedAt', v_capture.practice_source_confirmed_at,
      'conceptId', v_capture.practice_concept_id
    );
  end if;

  -- A student may correct a previously confirmed transcription. The expected
  -- version is the compare-and-swap boundary; identical lost-response retries
  -- returned above do not increment it.
  if v_capture.practice_source_status not in ('needs_review', 'confirmed') then
    return jsonb_build_object(
      'disposition', 'stale-version',
      'version', v_capture.practice_source_version,
      'status', v_capture.practice_source_status
    );
  end if;

  if v_capture.practice_source_version <> p_expected_version then
    return jsonb_build_object(
      'disposition', 'stale-version',
      'version', v_capture.practice_source_version,
      'status', v_capture.practice_source_status
    );
  end if;

  -- Concept resolution, mastery exposure, provenance, source confirmation and
  -- artifact invalidation are one transaction. A stale competing tab cannot
  -- leave behind a concept or mastery row after losing the version CAS.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'assignment-practice-concept:' || p_user_id::text || ':' || v_capture.class_id::text,
      0
    )
  );

  select concept.id
    into v_practice_concept_id
  from public.concepts concept
  where concept.user_id = p_user_id
    and concept.class_id is not distinct from v_capture.class_id
    and concept.identity_key = p_concept_identity_key
  order by concept.created_at asc, concept.id asc
  limit 1
  for update;

  if v_practice_concept_id is null then
    select concept.id
      into v_practice_concept_id
    from public.concepts concept
    where concept.user_id = p_user_id
      and concept.class_id is not distinct from v_capture.class_id
      and concept.identity_key is null
      and lower(concept.name) = lower(p_concept_name)
    order by concept.created_at asc, concept.id asc
    limit 1
    for update;
  end if;

  if v_practice_concept_id is not null then
    begin
      update public.concepts
      set
        identity_key = p_concept_identity_key,
        retired_at = null
      where id = v_practice_concept_id
        and user_id = p_user_id;
    exception when unique_violation then
      select concept.id
        into v_practice_concept_id
      from public.concepts concept
      where concept.user_id = p_user_id
        and concept.class_id is not distinct from v_capture.class_id
        and concept.identity_key = p_concept_identity_key
      order by concept.created_at asc, concept.id asc
      limit 1
      for update;
    end;
  else
    insert into public.concepts (
      user_id, class_id, client_class_id, capture_id, identity_key,
      name, slug, definition, examples, professor_emphasis, embedding, source_kind
    ) values (
      p_user_id, v_capture.class_id, v_capture.client_class_id, p_capture_id,
      p_concept_identity_key, p_concept_name, p_concept_slug,
      p_concept_definition, array[]::text[], false, null,
      'student-confirmed-assignment'
    )
    on conflict (user_id, class_id, identity_key) do update
    set
      retired_at = null
    returning id into v_practice_concept_id;
  end if;

  if v_practice_concept_id is null then
    raise exception using
      errcode = '23514',
      message = 'practice concept could not be resolved';
  end if;

  -- Assignment confirmation establishes provenance, not ownership of stable
  -- course truth. Preserve content when a trusted non-assignment capture
  -- already supports this concept. Assignment-only legacy rows can be repaired
  -- with original generic teaching copy, but the exact homework prompt stays
  -- exclusively in captures.practice_source_text for Tutor.
  select exists (
    select 1
    from public.concept_capture_evidence evidence
    join public.captures source_capture
      on source_capture.id = evidence.capture_id
     and source_capture.user_id = evidence.user_id
    where evidence.user_id = p_user_id
      and evidence.concept_id = v_practice_concept_id
      and source_capture.kind <> 'scan-assignment'
  ) into v_has_trusted_evidence;

  update public.concepts
  set
    identity_key = p_concept_identity_key,
    name = case when v_has_trusted_evidence then name else p_concept_name end,
    slug = case when v_has_trusted_evidence then slug else p_concept_slug end,
    definition = case when v_has_trusted_evidence then definition else p_concept_definition end,
    examples = case when v_has_trusted_evidence then examples else array[]::text[] end,
    source_kind = case
      when v_has_trusted_evidence then source_kind
      else 'student-confirmed-assignment'
    end,
    retired_at = null
  where id = v_practice_concept_id
    and user_id = p_user_id;

  insert into public.user_concept_mastery (
    user_id, concept_id, class_id, strength, attempts, correct,
    last_seen_at, next_review_at, streak
  ) values (
    p_user_id, v_practice_concept_id, v_capture.class_id, 0, 0, 0,
    null, now(), 0
  )
  on conflict (user_id, concept_id) do nothing;

  v_next_version := v_capture.practice_source_version + 1;
  insert into public.concept_capture_evidence (user_id, concept_id, capture_id)
  values (p_user_id, v_practice_concept_id, p_capture_id)
  on conflict do nothing;

  -- When a corrected transcription resolves to another skill, this capture no
  -- longer evidences the previously pinned skill. Keep shared/history rows for
  -- audit, but retire an orphan from current generation/readiness. If this was
  -- its legacy primary capture, re-anchor it to another active occurrence.
  if v_previous_concept_id is not null
      and v_previous_concept_id <> v_practice_concept_id then
    delete from public.concept_capture_evidence evidence
    where evidence.user_id = p_user_id
      and evidence.concept_id = v_previous_concept_id
      and evidence.capture_id = p_capture_id;

    update public.concepts concept
    set capture_id = (
      select evidence.capture_id
      from public.concept_capture_evidence evidence
      where evidence.user_id = p_user_id
        and evidence.concept_id = v_previous_concept_id
      order by evidence.created_at asc, evidence.capture_id asc
      limit 1
    )
    where concept.id = v_previous_concept_id
      and concept.user_id = p_user_id
      and concept.capture_id = p_capture_id;

    if not exists (
      select 1
      from public.concept_capture_evidence evidence
      where evidence.user_id = p_user_id
        and evidence.concept_id = v_previous_concept_id
    ) then
      update public.concepts concept
      set retired_at = now()
      where concept.id = v_previous_concept_id
        and concept.user_id = p_user_id;
    end if;

  end if;

  update public.captures
  set
    practice_source_status = 'confirmed',
    practice_source_text = p_source_text,
    practice_source_version = v_next_version,
    practice_source_hash = p_source_hash,
    practice_source_confirmed_at = now(),
    practice_concept_id = v_practice_concept_id
  where id = p_capture_id
    and user_id = p_user_id;

  -- Invalidate only derivatives of this exact assignment source. A stable
  -- concept may also be backed by trusted notes/material; confirming or
  -- correcting homework must not stale those unrelated artifacts. Concept-wide
  -- invalidation is reserved for the previous concept when it became orphaned
  -- and was retired above.
  update public.learning_artifacts artifact
  set stale = true
  where artifact.user_id = p_user_id
    and (
      artifact.capture_id = p_capture_id
      or artifact.study_scope_snapshot -> 'assignmentReviewSource' ->> 'captureId'
        = p_capture_id::text
      or (
        v_previous_concept_id is not null
        and v_previous_concept_id = any(artifact.concept_ids)
        and exists (
          select 1
          from public.concepts previous_concept
          where previous_concept.id = v_previous_concept_id
            and previous_concept.user_id = p_user_id
            and previous_concept.retired_at is not null
        )
      )
    )
    and artifact.stale = false;

  -- A completed result remains immutable audit history. An unfinished result
  -- reservation for a now-stale source must not survive, because the retry path
  -- intentionally reads prior attempts before applying the ordinary stale and
  -- retired-concept gates.
  delete from public.study_sessions session
  using public.study_result_attempts attempt, public.learning_artifacts artifact
  where attempt.user_id = p_user_id
    and attempt.result_status <> 'completed'
    and artifact.user_id = attempt.user_id
    and artifact.id = attempt.artifact_id
    and artifact.stale = true
    and (
      artifact.capture_id = p_capture_id
      or artifact.study_scope_snapshot -> 'assignmentReviewSource' ->> 'captureId'
        = p_capture_id::text
      or (
        v_previous_concept_id is not null
        and v_previous_concept_id = any(artifact.concept_ids)
        and exists (
          select 1
          from public.concepts previous_concept
          where previous_concept.id = v_previous_concept_id
            and previous_concept.user_id = p_user_id
            and previous_concept.retired_at is not null
        )
      )
    )
    and session.user_id = attempt.user_id
    and (
      (attempt.session_id is not null and session.id = attempt.session_id)
      or (
        session.client_attempt_id = attempt.client_attempt_id
        and session.artifact_id = attempt.artifact_id
      )
    )
    and session.result_status in ('processing', 'failed');

  delete from public.study_result_attempts attempt
  using public.learning_artifacts artifact
  where attempt.user_id = p_user_id
    and attempt.result_status <> 'completed'
    and artifact.user_id = attempt.user_id
    and artifact.id = attempt.artifact_id
    and artifact.stale = true
    and (
      artifact.capture_id = p_capture_id
      or artifact.study_scope_snapshot -> 'assignmentReviewSource' ->> 'captureId'
        = p_capture_id::text
      or (
        v_previous_concept_id is not null
        and v_previous_concept_id = any(artifact.concept_ids)
        and exists (
          select 1
          from public.concepts previous_concept
          where previous_concept.id = v_previous_concept_id
            and previous_concept.user_id = p_user_id
            and previous_concept.retired_at is not null
        )
      )
    );

  -- A corrected source can retire or reactivate a class concept. Drop cached
  -- readiness so the UI cannot keep presenting an aggregate computed from the
  -- superseded concept set.
  delete from public.readiness_scores score
  where score.user_id = p_user_id
    and score.class_id = v_capture.class_id;

  update public.exams exam
  set readiness = 0,
      updated_at = now()
  where exam.user_id = p_user_id
    and exam.class_id is not distinct from v_capture.class_id
    and exam.source_archived_at is null;

  return jsonb_build_object(
    'disposition', 'confirmed',
    'idempotent', false,
    'version', v_next_version,
    'hash', p_source_hash,
    'confirmedAt', now(),
    'conceptId', v_practice_concept_id
  );
end;
$$;

revoke all on function public.protect_assignment_practice_source()
  from public, anon, authenticated;
grant execute on function public.protect_assignment_practice_source()
  to service_role;

revoke all on function public.confirm_assignment_practice_source(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.confirm_assignment_practice_source(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.insert_confirmed_assignment_practice_artifact(
  uuid, uuid, integer, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.insert_confirmed_assignment_practice_artifact(
  uuid, uuid, integer, text, uuid, jsonb
) to service_role;

comment on column public.captures.practice_source_text is
  'Exact student-confirmed Assignment Tutor problem. raw_text remains the immutable OCR evidence.';
