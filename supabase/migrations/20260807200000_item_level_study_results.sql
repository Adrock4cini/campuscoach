-- Preserve every scored item and apply confidence-aware mastery atomically.
--
-- The July concept ledger remains intact for deployment compatibility. New
-- clients use this item ledger so repeated questions for one concept are not
-- collapsed into one boolean and objective correctness is derived from the
-- stored artifact rather than trusted from the browser.

create table if not exists public.study_item_results (
  user_id uuid not null,
  client_attempt_id uuid not null,
  item_index integer not null check (item_index >= 0),
  study_session_id uuid not null references public.study_sessions(id) on delete restrict,
  artifact_id uuid references public.learning_artifacts(id) on delete set null,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  evidence_type text not null check (evidence_type in ('objective', 'self_report')),
  answer_correct boolean not null,
  answer_confidence text not null check (answer_confidence in ('low', 'medium', 'high')),
  selected_choice_index integer,
  self_reported_correct boolean,
  previous_strength real not null,
  resulting_strength real,
  applied_at timestamptz not null default now(),
  primary key (user_id, client_attempt_id, item_index),
  check (previous_strength between 0 and 1),
  check (resulting_strength is null or resulting_strength between 0 and 1),
  check (selected_choice_index is null or selected_choice_index >= 0),
  check (
    (evidence_type = 'objective'
      and selected_choice_index is not null
      and self_reported_correct is null)
    or
    (evidence_type = 'self_report'
      and selected_choice_index is null
      and self_reported_correct is not null
      and answer_correct = self_reported_correct)
  )
);

create index if not exists study_item_results_concept_history_idx
  on public.study_item_results (user_id, concept_id, applied_at desc);

alter table public.study_item_results enable row level security;

revoke all on table public.study_item_results from public, anon, authenticated;
grant select on public.study_item_results to authenticated;
grant all on public.study_item_results to service_role;

create policy "study_item_results_owner_select"
  on public.study_item_results for select
  using (public.owns_row(user_id));

create or replace function public.apply_study_item_result(
  p_attempt_id uuid,
  p_item_index integer,
  p_confidence text,
  p_selected_choice_index integer default null,
  p_self_reported_correct boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_seen_at timestamptz := clock_timestamp();
  v_session_id uuid;
  v_session_status text;
  v_session_class_id uuid;
  v_session_client_class_id text;
  v_artifact_id uuid;
  v_artifact_class_id text;
  v_artifact_client_class_id text;
  v_artifact_kind text;
  v_artifact_payload jsonb;
  v_artifact_concept_ids uuid[];
  v_item jsonb;
  v_concept_id uuid;
  v_concept_marker uuid;
  v_class_id uuid;
  v_concept_client_class_id text;
  v_evidence_type text;
  v_answer_correct boolean;
  v_answer_index integer;
  v_choice_count integer;
  v_inserted_index integer;
  v_existing public.study_item_results%rowtype;
  v_previous_strength real := 0;
  v_previous_attempts integer := 0;
  v_previous_correct integer := 0;
  v_previous_streak integer := 0;
  v_previous_next_review timestamptz;
  v_resulting_strength real;
  v_resulting_attempts integer;
  v_resulting_correct integer;
  v_resulting_streak integer;
  v_next_review timestamptz;
  v_next_hours numeric;
  v_delta real;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_attempt_id is null then
    raise exception 'attempt id is required';
  end if;
  if p_item_index is null or p_item_index < 0 then
    raise exception 'item index must be non-negative';
  end if;
  if p_confidence is null or p_confidence not in ('low', 'medium', 'high') then
    raise exception 'invalid confidence';
  end if;

  select
    session.id,
    session.result_status,
    session.class_id,
    session.client_class_id,
    artifact.id,
    artifact.class_id,
    artifact.client_class_id,
    artifact.kind::text,
    artifact.payload,
    artifact.concept_ids
  into
    v_session_id,
    v_session_status,
    v_session_class_id,
    v_session_client_class_id,
    v_artifact_id,
    v_artifact_class_id,
    v_artifact_client_class_id,
    v_artifact_kind,
    v_artifact_payload,
    v_artifact_concept_ids
  from public.study_sessions as session
  join public.learning_artifacts as artifact
    on artifact.id = session.artifact_id
   and artifact.user_id = v_user_id
  where session.user_id = v_user_id
    and session.client_attempt_id = p_attempt_id
  for update of session;

  if v_session_id is null then
    raise exception 'Study attempt not found';
  end if;
  if v_session_status <> 'processing' then
    raise exception 'Study attempt is not accepting results';
  end if;

  if v_artifact_kind = 'multiple_choice' then
    v_item := v_artifact_payload -> 'questions' -> p_item_index;
    if v_item is null or jsonb_typeof(v_item) <> 'object' then
      raise exception 'Study item not found';
    end if;
    if p_selected_choice_index is null or p_self_reported_correct is not null then
      raise exception 'Multiple-choice response shape is invalid';
    end if;
    if jsonb_typeof(v_item -> 'choices') is distinct from 'array' then
      raise exception 'Stored multiple-choice item is invalid';
    end if;
    v_choice_count := jsonb_array_length(v_item -> 'choices');
    if jsonb_typeof(v_item -> 'answerIndex') is distinct from 'number' then
      raise exception 'Stored multiple-choice answer is invalid';
    end if;
    begin
      v_answer_index := (v_item ->> 'answerIndex')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Stored multiple-choice answer is invalid';
    end;
    if v_answer_index < 0 or v_answer_index >= v_choice_count then
      raise exception 'Stored multiple-choice answer is invalid';
    end if;
    if p_selected_choice_index < 0 or p_selected_choice_index >= v_choice_count then
      raise exception 'Selected choice is invalid';
    end if;
    v_answer_correct := p_selected_choice_index = v_answer_index;
    v_evidence_type := 'objective';
  elsif v_artifact_kind = 'flashcards' then
    v_item := v_artifact_payload -> 'cards' -> p_item_index;
    if v_item is null or jsonb_typeof(v_item) <> 'object' then
      raise exception 'Study item not found';
    end if;
    if p_self_reported_correct is null or p_selected_choice_index is not null then
      raise exception 'Flashcard response shape is invalid';
    end if;
    v_answer_correct := p_self_reported_correct;
    v_evidence_type := 'self_report';
  else
    raise exception 'Artifact kind is not objectively scorable';
  end if;

  begin
    v_concept_id := nullif(v_item ->> 'conceptId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Stored study item has invalid concept attribution';
  end;
  if v_concept_id is null
      or v_artifact_concept_ids is null
      or not coalesce(v_concept_id = any(v_artifact_concept_ids), false) then
    raise exception 'Stored study item has no valid concept attribution';
  end if;

  -- The concept row is both the ownership check and the stable lock that
  -- serializes concurrent attempts for the same permanent memory.
  select id, class_id, client_class_id
  into v_concept_marker, v_class_id, v_concept_client_class_id
  from public.concepts
  where id = v_concept_id and user_id = v_user_id
  for update;
  if v_concept_marker is null then
    raise exception 'Concept not found';
  end if;
  if v_session_class_id is not null and v_class_id is not null
      and v_session_class_id <> v_class_id then
    raise exception 'Study item crosses class boundaries';
  end if;
  if v_session_client_class_id is not null and v_concept_client_class_id is not null
      and v_session_client_class_id <> v_concept_client_class_id then
    raise exception 'Study item crosses class boundaries';
  end if;
  if v_artifact_class_id is not null and v_class_id is not null
      and v_artifact_class_id <> v_class_id::text then
    raise exception 'Artifact and concept class do not match';
  end if;
  if v_artifact_client_class_id is not null and v_concept_client_class_id is not null
      and v_artifact_client_class_id <> v_concept_client_class_id then
    raise exception 'Artifact and concept class do not match';
  end if;
  v_class_id := coalesce(v_class_id, v_session_class_id);

  select strength, attempts, correct, streak, next_review_at
  into
    v_previous_strength,
    v_previous_attempts,
    v_previous_correct,
    v_previous_streak,
    v_previous_next_review
  from public.user_concept_mastery
  where user_id = v_user_id and concept_id = v_concept_id
  for update;

  v_previous_strength := coalesce(v_previous_strength, 0);
  v_previous_attempts := coalesce(v_previous_attempts, 0);
  v_previous_correct := coalesce(v_previous_correct, 0);
  v_previous_streak := coalesce(v_previous_streak, 0);

  insert into public.study_item_results (
    user_id,
    client_attempt_id,
    item_index,
    study_session_id,
    artifact_id,
    concept_id,
    class_id,
    evidence_type,
    answer_correct,
    answer_confidence,
    selected_choice_index,
    self_reported_correct,
    previous_strength
  ) values (
    v_user_id,
    p_attempt_id,
    p_item_index,
    v_session_id,
    v_artifact_id,
    v_concept_id,
    v_class_id,
    v_evidence_type,
    v_answer_correct,
    p_confidence,
    p_selected_choice_index,
    p_self_reported_correct,
    v_previous_strength
  )
  on conflict (user_id, client_attempt_id, item_index) do nothing
  returning item_index into v_inserted_index;

  if v_inserted_index is null then
    select * into v_existing
    from public.study_item_results
    where user_id = v_user_id
      and client_attempt_id = p_attempt_id
      and item_index = p_item_index;

    if v_existing.artifact_id is distinct from v_artifact_id
        or v_existing.concept_id is distinct from v_concept_id
        or v_existing.answer_confidence is distinct from p_confidence
        or v_existing.selected_choice_index is distinct from p_selected_choice_index
        or v_existing.self_reported_correct is distinct from p_self_reported_correct then
      raise exception 'Study item retry payload changed';
    end if;

    return jsonb_build_object(
      'applied', false,
      'conceptId', v_existing.concept_id,
      'correct', v_existing.answer_correct,
      'evidenceType', v_existing.evidence_type,
      'previousStrength', v_existing.previous_strength,
      'resultingStrength', v_existing.resulting_strength
    );
  end if;

  v_resulting_attempts := v_previous_attempts + 1;
  v_resulting_correct := v_previous_correct + case when v_answer_correct then 1 else 0 end;

  if v_evidence_type = 'self_report' and v_answer_correct then
    v_resulting_strength := v_previous_strength;
    v_resulting_streak := v_previous_streak;
    v_next_review := least(
      coalesce(v_previous_next_review, v_seen_at + interval '12 hours'),
      v_seen_at + interval '12 hours'
    );
  else
    v_delta := case
      when not v_answer_correct and p_confidence = 'high' then -0.22
      when not v_answer_correct and p_confidence = 'low' then -0.08
      when not v_answer_correct then -0.10
      when p_confidence = 'high' then 0.18
      when p_confidence = 'low' then 0.10
      else 0.15
    end;
    v_resulting_strength := greatest(0, least(1, v_previous_strength + v_delta));
    v_resulting_streak := case when v_answer_correct then v_previous_streak + 1 else 0 end;

    if not v_answer_correct then
      v_next_hours := case when p_confidence = 'high' then 2 else 4 end;
    else
      v_next_hours := least(
        720,
        case
          when p_confidence = 'low'
            then greatest(8, 24 * power(2, greatest(0, v_resulting_streak - 1)) * 0.6)
          else 24 * power(2, greatest(0, v_resulting_streak - 1))
        end
      );
    end if;
    v_next_review := v_seen_at + make_interval(secs => (v_next_hours * 3600)::double precision);
  end if;

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
    v_concept_id,
    v_class_id,
    v_resulting_attempts,
    v_resulting_correct,
    v_resulting_strength,
    v_resulting_streak,
    v_seen_at,
    v_next_review
  )
  on conflict (user_id, concept_id) do update set
    class_id = coalesce(excluded.class_id, public.user_concept_mastery.class_id),
    attempts = excluded.attempts,
    correct = excluded.correct,
    strength = excluded.strength,
    streak = excluded.streak,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at;

  update public.study_item_results
  set resulting_strength = v_resulting_strength,
      applied_at = v_seen_at
  where user_id = v_user_id
    and client_attempt_id = p_attempt_id
    and item_index = p_item_index;

  return jsonb_build_object(
    'applied', true,
    'conceptId', v_concept_id,
    'correct', v_answer_correct,
    'evidenceType', v_evidence_type,
    'previousStrength', v_previous_strength,
    'resultingStrength', v_resulting_strength
  );
end;
$$;

revoke all on function public.apply_study_item_result(
  uuid, integer, text, integer, boolean
) from public, anon;
grant execute on function public.apply_study_item_result(
  uuid, integer, text, integer, boolean
) to authenticated, service_role;

comment on table public.study_item_results is
  'Durable item-level retrieval evidence. Objective correctness is derived from the stored artifact.';
comment on function public.apply_study_item_result(
  uuid, integer, text, integer, boolean
) is
  'Atomically records one item and applies confidence-aware mastery after explicit caller ownership checks.';

-- Rollout note: deploy this migration, then record-study-result-v2, then cut
-- the client over in a separate release. Revoke authenticated execution of
-- apply_study_concept_result only after old clients drain. Keeping the legacy
-- RPC during cutover avoids breaking the deployed v1 edge function.
