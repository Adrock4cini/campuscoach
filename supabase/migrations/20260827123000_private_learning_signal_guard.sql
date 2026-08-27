-- Launch privacy boundary for student learning signals.
--
-- Historical migrations briefly exposed raw topic signals, exam debriefs,
-- and aggregate topic scores to anonymous clients. RLS policies are ORed, so
-- adding a restrictive policy is not sufficient while any permissive policy
-- remains. Remove every existing policy on these three tables first, then
-- install the complete launch policy set below.

alter table public.topic_signals enable row level security;
alter table public.exam_debriefs enable row level security;
alter table public.topic_scores enable row level security;

do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('topic_signals', 'exam_debriefs', 'topic_scores')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  end loop;
end;
$policy_cleanup$;

-- Raw learning signals are private student records. Authenticated clients may
-- read and mutate only rows whose user_id is their current auth subject.
create policy topic_signals_owner_select
  on public.topic_signals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy topic_signals_owner_insert
  on public.topic_signals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy topic_signals_owner_update
  on public.topic_signals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy topic_signals_owner_delete
  on public.topic_signals
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy exam_debriefs_owner_select
  on public.exam_debriefs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy exam_debriefs_owner_insert
  on public.exam_debriefs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy exam_debriefs_owner_update
  on public.exam_debriefs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy exam_debriefs_owner_delete
  on public.exam_debriefs
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Table grants are a second boundary in addition to RLS. The browser gets no
-- anonymous access and only the authenticated CRUD needed by the owner rules.
revoke all privileges on table public.topic_signals
  from public, anon, authenticated;
revoke all privileges on table public.exam_debriefs
  from public, anon, authenticated;

grant select, insert, update, delete on table public.topic_signals
  to authenticated;
grant select, insert, update, delete on table public.exam_debriefs
  to authenticated;

grant all privileges on table public.topic_signals to service_role;
grant all privileges on table public.exam_debriefs to service_role;

-- Cross-student aggregates are intentionally backend-only for launch. The
-- real Class Intelligence route is still disabled; a later release can expose
-- a thresholded, privacy-reviewed RPC instead of granting this raw table.
revoke all privileges on table public.topic_scores
  from public, anon, authenticated;
grant all privileges on table public.topic_scores to service_role;
