-- Study Intelligence v1 privilege lockdown.
--
-- Roll this migration only after:
--   1. 20260817190000_study_intelligence_v1.sql is applied, and
--   2. the matching generate-artifact, record-study-result,
--      extract-concepts, and process-capture-images Edge Functions are
--      deployed and verified.
--
-- That two-step order keeps the currently deployed capture/study functions
-- working during rollout while still ending with a server-only mastery write
-- boundary.

-- Browsers may read their own mastery, but only authenticated Edge Functions
-- holding the service role may mutate mastery or its idempotency ledger. The
-- original owner policies remain as defense in depth; privileges fail closed
-- before those policies are reached.
revoke insert, update, delete on table public.user_concept_mastery from authenticated;
revoke all on table public.study_result_concept_updates from authenticated;
revoke insert, update, delete on table public.learning_artifacts from authenticated;
revoke insert, update, delete on table public.concepts from authenticated;
grant select on table public.user_concept_mastery to authenticated;
grant select on table public.learning_artifacts to authenticated;
grant select on table public.concepts to authenticated;
grant all on table public.study_result_concept_updates to service_role;

-- Preserve browser-written legacy history while making every artifact-backed
-- result row server-managed. This lands only after the compatible Edge function
-- is deployed, because that function writes protected rows with service_role.
create or replace function public.guard_artifact_study_session_writes()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text := coalesce(auth.role(), current_user);
  v_old_protected boolean := false;
  v_new_protected boolean := false;
begin
  if tg_op <> 'INSERT' then
    v_old_protected := old.artifact_id is not null
      or old.client_attempt_id is not null
      or old.result_request_hash is not null
      or old.result_payload is not null
      or old.result_status <> 'completed'
      or coalesce(old.mode, '') like 'artifact:%';
  end if;
  if tg_op <> 'DELETE' then
    v_new_protected := new.artifact_id is not null
      or new.client_attempt_id is not null
      or new.result_request_hash is not null
      or new.result_payload is not null
      or new.result_status <> 'completed'
      or coalesce(new.mode, '') like 'artifact:%';
  end if;

  if v_role in ('anon', 'authenticated') and (v_old_protected or v_new_protected) then
    raise exception 'Artifact study history is server-managed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_artifact_study_session_writes
  on public.study_sessions;
create trigger guard_artifact_study_session_writes
before insert or update or delete on public.study_sessions
for each row execute function public.guard_artifact_study_session_writes();

revoke all on function public.guard_artifact_study_session_writes()
  from public, anon, authenticated;

-- Retire the older browser-callable mastery path. It lacks confidence and the
-- stricter class/timestamp contract in apply_study_concept_result_v2.
revoke all on function public.apply_study_concept_result(
  uuid, uuid, uuid, boolean, timestamptz
) from public, anon, authenticated, service_role;

comment on table public.study_result_concept_updates is
  'Server-written idempotency ledger for verified study results; no browser DML.';