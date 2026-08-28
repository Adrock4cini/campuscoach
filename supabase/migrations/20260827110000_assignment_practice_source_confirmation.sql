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
      or case
        when jsonb_typeof(p_artifact -> 'concept_ids') = 'array'
          then jsonb_array_length(p_artifact -> 'concept_ids') <> 1
        else true
      end
      or p_artifact -> 'concept_ids' ->> 0 is distinct from p_concept_id::text
      or jsonb_typeof(p_artifact -> 'study_scope_snapshot') is distinct from 'object'
      or jsonb_typeof(p_artifact -> 'payload') is distinct from 'object'
      or jsonb_typeof(p_artifact -> 'payload' -> 'problems') is distinct from 'array'
      or case
        when jsonb_typeof(p_artifact -> 'payload' -> 'problems') = 'array'
          then jsonb_array_length(p_artifact -> 'payload' -> 'problems')