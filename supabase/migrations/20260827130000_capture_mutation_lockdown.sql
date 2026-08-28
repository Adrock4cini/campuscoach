-- POST-FUNCTION ROLLOUT STEP
--
-- Apply this migration only after the capture workers from the same release
-- are deployed. The preceding additive migrations are compatible with the old
-- authenticated-worker implementation; this lockdown assumes every capture
-- UPDATE is now performed with the service-role client. The separate 127500
-- worker-drain migration must already have committed, so the retired evidence
-- mirror cannot introduce a concept -> capture lock inversion here. Capture,
-- artifact-generation and study-result writes must remain paused until this
-- transaction commits; these table locks are a database guard, not a substitute
-- for draining multi-request legacy worker invocations.

-- Drain any result transaction first, then block capture readers that take a
-- row-strength lock as part of generation, confirmation or mastery. Holding
-- these gates until commit makes the reconciliation below the final handoff
-- boundary: no late legacy writer can recreate unconfirmed assignment learning
-- between cleanup and the browser-write lockdown.
lock table public.study_result_attempts in exclusive mode;
lock table public.captures in exclusive mode;
lock table public.assignments in share row exclusive mode;
lock table public.concepts in share row exclusive mode;
lock table public.user_concept_mastery in share row exclusive mode;
lock table public.learning_artifacts in share row exclusive mode;
lock table public.study_strategy_outcomes in share row exclusive mode;
lock table public.study_sessions in share row exclusive mode;
lock table public.topic_signals in share row exclusive mode;
lock table public.processed_content in share row exclusive mode;
lock table public.flashcards in share row exclusive mode;
lock table public.quizzes in share row exclusive mode;
lock table public.readiness_scores in share row exclusive mode;
lock table public.classes in share row exclusive mode;
lock table public.exams in share row exclusive mode;

-- Reconcile work completed by an old worker during the additive-schema
-- compatibility window. A confirmed capture may legitimately evidence exactly
-- its pinned practice concept; every other assignment occurrence is still
-- untrusted OCR. The temporary set makes this idempotent: after one successful
-- pass there is no matching evidence unless another obsolete worker wrote it.
create temporary table late_assignment_ocr_quarantine on commit drop as
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
where capture.kind = 'scan-assignment'
  and (
    capture.practice_source_status <> 'confirmed'
    or capture.practice_concept_id is distinct from evidence.concept_id
  );

delete from public.concept_capture_evidence evidence
using late_assignment_ocr_quarantine quarantined
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
  from late_assignment_ocr_quarantine quarantined
  where quarantined.user_id = concept.user_id
    and quarantined.concept_id = concept.id
    and quarantined.capture_id = concept.capture_id
);

update public.concepts concept
set retired_at = now()
where exists (
  select 1
  from late_assignment_ocr_quarantine quarantined
  where quarantined.user_id = concept.user_id
    and quarantined.concept_id = concept.id
)
and not exists (
  select 1
  from public.concept_capture_evidence evidence
  where evidence.user_id = concept.user_id
    and evidence.concept_id = concept.id
);

-- Preserve a newly generated Tutor artifact only when its full snapshot still
-- matches the current confirmed capture, assignment, active concept and exact
-- source. Everything else directly derived from an assignment capture is a
-- legacy/unconfirmed artifact and must be stale.
update public.learning_artifacts artifact
set stale = true
where artifact.stale = false
  and (
    exists (
      select 1
      from late_assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
    or (
      exists (
        select 1
        from public.captures capture
        where capture.id = artifact.capture_id
          and capture.user_id = artifact.user_id
          and capture.kind = 'scan-assignment'
      )
      and not exists (
        select 1
        from public.captures capture
        join public.assignments assignment
          on assignment.id = capture.assignment_id
         and assignment.user_id = capture.user_id
         and assignment.source_archived_at is null
         and assignment.class_id is not distinct from capture.class_id
         and assignment.client_class_id is not distinct from capture.client_class_id
        join public.concept_capture_evidence evidence
          on evidence.user_id = capture.user_id
         and evidence.capture_id = capture.id
         and evidence.concept_id = capture.practice_concept_id
        join public.concepts concept
          on concept.id = evidence.concept_id
         and concept.user_id = evidence.user_id
         and concept.retired_at is null
        where capture.id = artifact.capture_id
          and capture.user_id = artifact.user_id
          and capture.kind = 'scan-assignment'
          and capture.processing_status = 'ready'
          and capture.concept_extraction_claim_id is null
          and capture.practice_source_status = 'confirmed'
          and artifact.kind = 'practice'
          and cardinality(artifact.concept_ids) = 1
          and artifact.concept_ids[1] = capture.practice_concept_id
          and artifact.class_id = capture.class_id::text
          and artifact.client_class_id = capture.client_class_id
          and artifact.study_scope_snapshot ->> 'intent' = 'assignment-help'
          and artifact.study_scope_snapshot ->> 'captureId' = capture.id::text
          and artifact.study_scope_snapshot ->> 'assignmentId' = capture.assignment_id::text
          and artifact.study_scope_snapshot ->> 'practiceSourceVersion' = capture.practice_source_version::text
          and artifact.study_scope_snapshot ->> 'practiceSourceHash' = capture.practice_source_hash
          and artifact.study_scope_snapshot ->> 'practiceConceptId' = capture.practice_concept_id::text
          and artifact.payload -> 'problems' -> 0 ->> 'conceptId' = capture.practice_concept_id::text
          and artifact.payload -> 'problems' -> 0 ->> 'sourceExcerpt' = capture.practice_source_text
      )
    )
  );

-- Snapshot unsafe artifacts and their unfinished reservations. Completed
-- attempts/sessions remain immutable audit history. Processing and failed
-- reservations are not recoverable because their source boundary is now stale
-- or retired; removing them prevents the retry path's prior-attempt exception
-- from reviving quarantined learning.
create temporary table late_assignment_unsafe_artifacts on commit drop as
select distinct artifact.user_id, artifact.id as artifact_id
from public.learning_artifacts artifact
where artifact.stale = true
  and (
    exists (
      select 1
      from late_assignment_ocr_quarantine quarantined
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

create temporary table late_assignment_attempt_quarantine on commit drop as
select
  attempt.user_id,
  attempt.client_attempt_id,
  attempt.artifact_id,
  attempt.session_id
from public.study_result_attempts attempt
join late_assignment_unsafe_artifacts artifact
  on artifact.user_id = attempt.user_id
 and artifact.artifact_id = attempt.artifact_id
where attempt.result_status <> 'completed';

-- Any concept touched by unconfirmed or mismatched assignment OCR returns to
-- neutral. The capture established scope/provenance, not student knowledge;
-- verified retrieval/application can rebuild mastery after the handoff.
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
  from late_assignment_ocr_quarantine quarantined
  where quarantined.user_id = mastery.user_id
    and quarantined.concept_id = mastery.concept_id
);

delete from public.study_strategy_outcomes outcome
using public.learning_artifacts artifact
where outcome.user_id = artifact.user_id
  and outcome.artifact_id = artifact.id
  and artifact.stale = true
  and (
    exists (
      select 1
      from public.captures capture
      where capture.id = artifact.capture_id
        and capture.user_id = artifact.user_id
        and capture.kind = 'scan-assignment'
    )
    or exists (
      select 1
      from late_assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
  );

delete from public.topic_signals signal
using public.study_sessions session, public.learning_artifacts artifact
where signal.user_id = session.user_id
  and signal.source_type = 'study-session'
  and signal.source_id = session.id::text
  and session.artifact_id = artifact.id
  and session.user_id = artifact.user_id
  and artifact.stale = true
  and (
    exists (
      select 1
      from public.captures capture
      where capture.id = artifact.capture_id
        and capture.user_id = artifact.user_id
        and capture.kind = 'scan-assignment'
    )
    or exists (
      select 1
      from late_assignment_ocr_quarantine quarantined
      join public.concepts concept
        on concept.id = quarantined.concept_id
       and concept.user_id = quarantined.user_id
       and concept.retired_at is not null
      where quarantined.user_id = artifact.user_id
        and quarantined.concept_id = any(artifact.concept_ids)
    )
  );

delete from public.study_sessions session
using late_assignment_attempt_quarantine quarantined
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
using late_assignment_attempt_quarantine quarantined
where attempt.user_id = quarantined.user_id
  and attempt.client_attempt_id = quarantined.client_attempt_id
  and attempt.artifact_id = quarantined.artifact_id
  and attempt.result_status <> 'completed';

-- New assignment workers never create these generic OCR derivatives. Removing
-- them on both reconciliation passes is therefore safe even if a student
-- confirmed the exact Tutor problem during the handoff.
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
  from late_assignment_ocr_quarantine quarantined
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
  from late_assignment_ocr_quarantine quarantined
  where quarantined.user_id = class.user_id
    and quarantined.class_id is not distinct from class.id
);

update public.exams exam
set readiness = 0,
    updated_at = now()
where exam.source_archived_at is null
  and exists (
    select 1
    from late_assignment_ocr_quarantine quarantined
    where quarantined.user_id = exam.user_id
      and quarantined.class_id is not distinct from exam.class_id
  );

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
        or (tg_op = 'UPDATE' and pg_catalog.pg_trigger_depth() = 1)
      ) then
    raise exception using
      errcode = '42501',
      message = 'capture lifecycle may only be changed by the server';
  end if;
  return new;
end;
$$;

-- Existing broad table grants predate the server-owned capture lifecycle.
-- Inserts and owner-scoped reads remain available; direct browser PATCHes are
-- denied while service workers retain the lifecycle write path.
revoke update on table public.captures from anon, authenticated;
grant update on table public.captures to service_role;

-- An upload rollback may remove a brand-new, unprocessed capture. Once a
-- capture owns review state, provenance, concepts, or artifacts, deletion must
-- go through a future service cleanup transaction rather than orphaning
-- current memory.
create or replace function public.protect_capture_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Foreign-key cascades from an account deletion run inside another trigger.
  -- They must be able to remove the complete owned graph atomically.
  if pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
      and (
        old.practice_source_status <> 'not_required'
        or exists (
          select 1
          from public.concept_capture_evidence evidence
          where evidence.user_id = old.user_id
            and evidence.capture_id = old.id
        )
        or exists (
          select 1
          from public.concepts concept
          where concept.user_id = old.user_id
            and concept.capture_id = old.id
        )
        or exists (
          select 1
          from public.learning_artifacts artifact
          where artifact.user_id = old.user_id
            and artifact.capture_id = old.id
        )
      ) then
    raise exception using
      errcode = '42501',
      message = 'processed captures require server-side cleanup';
  end if;
  return old;
end;
$$;

drop trigger if exists captures_protect_deletion on public.captures;
create trigger captures_protect_deletion
before delete on public.captures
for each row execute function public.protect_capture_deletion();

-- Do not allow parent deletion to silently detach a trusted capture. Unlinked
-- assignments/exams/classes retain their existing delete behavior; linked
-- parents must first be handled by an explicit service-owned cleanup flow.
create or replace function public.protect_capture_parent_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Do not block auth.users cascades. A direct parent delete remains protected,
  -- while a nested ownership-graph teardown is allowed to complete.
  if pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'assignments' and exists (
    select 1 from public.captures capture
    where capture.user_id = old.user_id
      and capture.assignment_id = old.id
  ) then
    raise exception using errcode = '23503', message = 'assignment has a saved capture';
  elsif tg_table_name = 'exams' and exists (
    select 1 from public.captures capture
    where capture.user_id = old.user_id
      and capture.exam_id = old.id
  ) then
    raise exception using errcode = '23503', message = 'exam has a saved capture';
  elsif tg_table_name = 'classes' and exists (
    select 1 from public.captures capture
    where capture.user_id = old.user_id
      and (
        capture.class_id = old.id
        or capture.client_class_id = old.client_class_id
      )
  ) then
    raise exception using errcode = '23503', message = 'class has a saved capture';
  end if;
  return old;
end;
$$;

-- Parent archive/status edits remain ordinary updates. Identity or class
-- reparenting would silently make an existing capture disagree with the row it
-- points at, so reject only those columns while a link exists.
create or replace function public.protect_capture_parent_reparenting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_table_name = 'assignments'
      and (
        old.user_id is distinct from new.user_id
        or old.class_id is distinct from new.class_id
        or old.client_class_id is distinct from new.client_class_id
      )
      and exists (
        select 1 from public.captures capture
        where capture.user_id = old.user_id
          and capture.assignment_id = old.id
      ) then
    raise exception using errcode = '23503', message = 'linked assignment cannot be reparented';
  elsif tg_table_name = 'exams'
      and (
        old.user_id is distinct from new.user_id
        or old.class_id is distinct from new.class_id
        or old.client_class_id is distinct from new.client_class_id
      )
      and exists (
        select 1 from public.captures capture
        where capture.user_id = old.user_id
          and capture.exam_id = old.id
      ) then
    raise exception using errcode = '23503', message = 'linked exam cannot be reparented';
  elsif tg_table_name = 'classes'
      and (
        old.user_id is distinct from new.user_id
        or old.client_class_id is distinct from new.client_class_id
      )
      and exists (
        select 1 from public.captures capture
        where capture.user_id = old.user_id
          and (
            capture.class_id = old.id
            or capture.client_class_id = old.client_class_id
          )
      ) then
    raise exception using errcode = '23503', message = 'linked class cannot be reparented';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_protect_capture_parent on public.assignments;
create trigger assignments_protect_capture_parent
before delete on public.assignments
for each row execute function public.protect_capture_parent_deletion();

drop trigger if exists assignments_protect_capture_reparenting on public.assignments;
create trigger assignments_protect_capture_reparenting
before update of user_id, class_id, client_class_id on public.assignments
for each row execute function public.protect_capture_parent_reparenting();

drop trigger if exists exams_protect_capture_parent on public.exams;
create trigger exams_protect_capture_parent
before delete on public.exams
for each row execute function public.protect_capture_parent_deletion();

drop trigger if exists exams_protect_capture_reparenting on public.exams;
create trigger exams_protect_capture_reparenting
before update of user_id, class_id, client_class_id on public.exams
for each row execute function public.protect_capture_parent_reparenting();

drop trigger if exists classes_protect_capture_parent on public.classes;
create trigger classes_protect_capture_parent
before delete on public.classes
for each row execute function public.protect_capture_parent_deletion();

drop trigger if exists classes_protect_capture_reparenting on public.classes;
create trigger classes_protect_capture_reparenting
before update of user_id, client_class_id on public.classes
for each row execute function public.protect_capture_parent_reparenting();

revoke all on function public.protect_capture_deletion()
  from public, anon, authenticated;
grant execute on function public.protect_capture_deletion()
  to service_role;

revoke all on function public.protect_capture_parent_deletion()
  from public, anon, authenticated;
grant execute on function public.protect_capture_parent_deletion()
  to service_role;

revoke all on function public.protect_capture_parent_reparenting()
  from public, anon, authenticated;
grant execute on function public.protect_capture_parent_reparenting()
  to service_role;
