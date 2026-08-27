-- Let one confirmed assignment-derived weakness reappear in a normal Study
-- Lab set without ever copying assignment OCR or the exact confirmed problem
-- into that set. The Edge function reduces the confirmed source to an
-- allowlisted generic rule; this RPC makes the resulting artifact insertion
-- linearizable with a later source correction.

create or replace function public.insert_confirmed_assignment_review_artifact(
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
  v_concept public.concepts%rowtype;
  v_inserted public.learning_artifacts%rowtype;
  v_snapshot jsonb;
  v_boundary jsonb;
  v_concept_ids uuid[];
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
      or coalesce(p_artifact ->> 'kind', '') not in ('flashcards', 'multiple_choice', 'matching')
      or p_artifact ->> 'user_id' is distinct from p_user_id::text
      or p_artifact ->> 'capture_id' is not null
      or jsonb_typeof(p_artifact -> 'concept_ids') is distinct from 'array'
      or case
        when jsonb_typeof(p_artifact -> 'concept_ids') = 'array'
          then jsonb_array_length(p_artifact -> 'concept_ids') not between 1 and 8
        else true
      end
      or jsonb_typeof(p_artifact -> 'study_scope_snapshot') is distinct from 'object'
      or jsonb_typeof(p_artifact -> 'payload') is distinct from 'object'
      or coalesce(p_artifact ->> 'study_scope_type', '') not in ('recent', 'exam', 'class')
      or coalesce(p_artifact ->> 'study_scope_id', '') = ''
      or coalesce(p_artifact ->> 'study_scope_label', '') = ''
      or p_artifact ->> 'model' is distinct from 'deterministic-grounded'
      or coalesce(p_artifact ->> 'prompt_version', '') = '' then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_artifact -> 'concept_ids') item(value)
    where item.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  select coalesce(array_agg(item.value::uuid), '{}'::uuid[])
    into v_concept_ids
  from jsonb_array_elements_text(p_artifact -> 'concept_ids') item(value);

  if not (p_concept_id = any(v_concept_ids)) then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  v_snapshot := p_artifact -> 'study_scope_snapshot';
  v_boundary := v_snapshot -> 'assignmentReviewSource';
  if jsonb_typeof(v_boundary) is distinct from 'object'
      or v_boundary ->> 'captureId' is distinct from p_capture_id::text
      or v_boundary ->> 'practiceConceptId' is distinct from p_concept_id::text
      or v_boundary ->> 'sourceVersion' is distinct from p_source_version::text
      or v_boundary ->> 'sourceHash' is distinct from p_source_hash
      or v_boundary ->> 'recipeVersion' is distinct from 'assignment-review-v1'
      or v_snapshot -> 'conceptIds' is distinct from p_artifact -> 'concept_ids'
      or v_snapshot ->> 'intent' = 'assignment-help' then
    return jsonb_build_object('disposition', 'invalid');
  end if;

  -- Confirmation takes FOR UPDATE on this same row. If this transaction wins,
  -- a later correction waits and then stales the inserted concept artifact. If
  -- confirmation wins, this read observes the new version and fails closed.
  select capture.*
    into v_capture
  from public.captures capture
  where capture.id = p_capture_id
    and capture.user_id = p_user_id
  for share;

  if not found then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  select concept.*
    into v_concept
  from public.concepts concept
  where concept.id = p_concept_id
    and concept.user_id = p_user_id
  for share;

  if not found
      or v_concept.retired_at is not null
      or v_capture.class_id is null
      or v_capture.kind <> 'scan-assignment'
      or v_capture.processing_status <> 'ready'
      or v_capture.concept_extraction_claim_id is not null
      or v_capture.practice_source_status <> 'confirmed'
      or v_capture.practice_source_version is distinct from p_source_version
      or v_capture.practice_source_hash is distinct from p_source_hash
      or v_capture.practice_concept_id is distinct from p_concept_id
      or v_capture.class_id is distinct from v_concept.class_id
      or v_capture.client_class_id is distinct from v_concept.client_class_id
      or p_artifact ->> 'class_id' is distinct from v_capture.class_id::text
      or p_artifact ->> 'client_class_id' is distinct from v_capture.client_class_id
      or not exists (
        select 1
        from public.concept_capture_evidence evidence
        where evidence.user_id = p_user_id
          and evidence.concept_id = p_concept_id
          and evidence.capture_id = p_capture_id
      ) then
    return jsonb_build_object('disposition', 'boundary-conflict');
  end if;

  -- Every concept in the mixed set must remain active, owned, and in the same
  -- class. The service-only caller is trusted to build the payload, but the
  -- database still owns the cross-row authorization boundary.
  if exists (
    select 1
    from unnest(v_concept_ids) requested(concept_id)
    left join public.concepts candidate
      on candidate.id = requested.concept_id
     and candidate.user_id = p_user_id
    where candidate.id is null
       or candidate.retired_at is not null
       or candidate.class_id is distinct from v_capture.class_id
       or candidate.client_class_id is distinct from v_capture.client_class_id
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
    (p_artifact ->> 'kind')::public.artifact_kind,
    v_concept_ids,
    null,
    p_artifact ->> 'topic',
    p_artifact ->> 'study_scope_type',
    p_artifact ->> 'study_scope_id',
    p_artifact ->> 'study_scope_label',
    v_snapshot,
    p_artifact -> 'payload',
    'deterministic-grounded',
    p_artifact ->> 'prompt_version'
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'disposition', 'inserted',
    'artifact', to_jsonb(v_inserted)
  );
end;
$$;

revoke all on function public.insert_confirmed_assignment_review_artifact(
  uuid, uuid, integer, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.insert_confirmed_assignment_review_artifact(
  uuid, uuid, integer, text, uuid, jsonb
) to service_role;

comment on function public.insert_confirmed_assignment_review_artifact(
  uuid, uuid, integer, text, uuid, jsonb
) is
  'Atomically inserts one deterministic class/recent/exam artifact grounded in a generic rule derived from a current student-confirmed assignment source.';
