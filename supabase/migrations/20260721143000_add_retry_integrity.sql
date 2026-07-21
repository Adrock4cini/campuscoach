-- Make student-facing retries safe.
--
-- A mobile connection can disappear after the server has already completed
-- work. These columns let the edge functions recognize that situation instead
-- of counting a study session twice or extracting the same capture twice.

alter table public.study_sessions
  add column if not exists artifact_id uuid references public.learning_artifacts(id) on delete set null,
  add column if not exists client_attempt_id uuid,
  add column if not exists result_status text not null default 'completed',
  add column if not exists result_payload jsonb;

alter table public.study_sessions
  drop constraint if exists study_sessions_result_status_check;

alter table public.study_sessions
  add constraint study_sessions_result_status_check
  check (result_status in ('processing', 'completed', 'failed'));

create unique index if not exists study_sessions_user_attempt_uidx
  on public.study_sessions (user_id, client_attempt_id)
  where client_attempt_id is not null;

alter table public.captures
  add column if not exists concept_extraction_claim_id uuid,
  add column if not exists concept_extraction_started_at timestamptz;

create index if not exists captures_extraction_claim_idx
  on public.captures (user_id, concept_extraction_claim_id)
  where concept_extraction_claim_id is not null;

-- A study attempt may be interrupted between concepts. This ledger and RPC
-- make each individual mastery update atomic with its idempotency marker, so
-- the edge function can safely resume the whole attempt after any crash.
create table if not exists public.study_result_concept_updates (
  user_id uuid not null,
  client_attempt_id uuid not null,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  answer_correct boolean not null,
  previous_strength real not null,
  resulting_strength real,
  applied_at timestamptz not null default now(),
  primary key (user_id, client_attempt_id, concept_id)
);

alter table public.study_result_concept_updates enable row level security;

grant select, insert, update, delete on public.study_result_concept_updates to authenticated;
grant all on public.study_result_concept_updates to service_role;

create policy "study_result_updates_owner_select"
  on public.study_result_concept_updates for select
  using (public.owns_row(user_id));
create policy "study_result_updates_owner_insert"
  on public.study_result_concept_updates for insert
  with check (public.owns_row(user_id));
create policy "study_result_updates_owner_update"
  on public.study_result_concept_updates for update
  using (public.owns_row(user_id)) with check (public.owns_row(user_id));
create policy "study_result_updates_owner_delete"
  on public.study_result_concept_updates for delete
  using (public.owns_row(user_id));

create or replace function public.apply_study_concept_result(
  p_attempt_id uuid,
  p_concept_id uuid,
  p_class_id uuid,
  p_correct boolean,
  p_seen_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
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
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  -- The concept row always exists and provides a stable lock even if a legacy
  -- capture is missing its seeded mastery row.
  select id, class_id
    into v_marker, v_class_id
    from public.concepts
    where id = p_concept_id and user_id = v_user_id
    for update;
  if v_marker is null then
    raise exception 'Concept not found';
  end if;
  v_class_id := coalesce(v_class_id, p_class_id);

  -- Lock an existing mastery row so two different study sessions cannot lose
  -- each other's increments.
  select strength, attempts, correct, streak
    into v_previous_strength, v_previous_attempts, v_previous_correct, v_previous_streak
    from public.user_concept_mastery
    where user_id = v_user_id and concept_id = p_concept_id
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
    previous_strength
  ) values (
    v_user_id,
    p_attempt_id,
    p_concept_id,
    v_class_id,
    p_correct,
    v_previous_strength
  )
  on conflict (user_id, client_attempt_id, concept_id) do nothing
  returning concept_id into v_marker;

  if v_marker is null then
    select previous_strength, resulting_strength
      into v_previous_strength, v_resulting_strength
      from public.study_result_concept_updates
      where user_id = v_user_id
        and client_attempt_id = p_attempt_id
        and concept_id = p_concept_id;
    return jsonb_build_object(
      'applied', false,
      'previousStrength', v_previous_strength,
      'resultingStrength', v_resulting_strength
    );
  end if;

  v_resulting_attempts := v_previous_attempts + 1;
  v_resulting_correct := v_previous_correct + case when p_correct then 1 else 0 end;
  v_resulting_strength := greatest(
    0,
    least(1, v_previous_strength + case when p_correct then 0.15 else -0.10 end)
  );
  v_resulting_streak := case when p_correct then v_previous_streak + 1 else 0 end;
  v_next_hours := case
    when not p_correct then 4
    else least(720, (24 * power(2, greatest(0, v_resulting_streak - 1)))::integer)
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
    class_id = coalesce(excluded.class_id, public.user_concept_mastery.class_id),
    attempts = excluded.attempts,
    correct = excluded.correct,
    strength = excluded.strength,
    streak = excluded.streak,
    last_seen_at = excluded.last_seen_at,
    next_review_at = excluded.next_review_at;

  update public.study_result_concept_updates
    set resulting_strength = v_resulting_strength,
        applied_at = p_seen_at
    where user_id = v_user_id
      and client_attempt_id = p_attempt_id
      and concept_id = p_concept_id;

  return jsonb_build_object(
    'applied', true,
    'previousStrength', v_previous_strength,
    'resultingStrength', v_resulting_strength
  );
end;
$$;

revoke all on function public.apply_study_concept_result(uuid, uuid, uuid, boolean, timestamptz)
  from public, anon;
grant execute on function public.apply_study_concept_result(uuid, uuid, uuid, boolean, timestamptz)
  to authenticated, service_role;

comment on column public.study_sessions.client_attempt_id is
  'Stable client-generated idempotency key reused when a study-result save is retried.';

comment on column public.study_sessions.result_payload is
  'Cached successful record-study-result response returned to safe retries.';

comment on column public.captures.concept_extraction_claim_id is
  'Short-lived claim preventing concurrent AI extraction for one capture.';
