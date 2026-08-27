-- Additive rollout control for the Assignment Tutor source-boundary handoff.
--
-- The control is private database state. Only service-role operators can read
-- or change it through the two public RPCs below. Edge Functions check it once
-- at request start; invocations that passed the gate before a pause must still
-- be allowed to drain before the post-worker migrations are applied.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.study_write_runtime_control (
  singleton boolean primary key default true check (singleton),
  paused boolean not null default false,
  reason text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint study_write_runtime_control_reason_check
    check (reason is null or char_length(reason) between 1 and 300)
);

alter table private.study_write_runtime_control enable row level security;
revoke all on table private.study_write_runtime_control
  from public, anon, authenticated, service_role;

insert into private.study_write_runtime_control (singleton, paused, reason)
values (true, false, null)
on conflict (singleton) do nothing;

create or replace function public.get_study_write_pause()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'paused', control.paused,
        'reason', control.reason,
        'updatedAt', control.updated_at
      )
      from private.study_write_runtime_control control
      where control.singleton
    ),
    jsonb_build_object(
      'paused', true,
      'reason', 'control_missing',
      'updatedAt', null
    )
  );
$$;

create or replace function public.set_study_writes_paused(
  p_paused boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_control private.study_write_runtime_control%rowtype;
begin
  if p_paused is null then
    raise exception using
      errcode = '22023',
      message = 'p_paused is required';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception using
      errcode = '22023',
      message = 'pause reason must be 300 characters or fewer';
  end if;

  insert into private.study_write_runtime_control (
    singleton,
    paused,
    reason,
    updated_at
  ) values (
    true,
    p_paused,
    case when p_paused then v_reason else null end,
    clock_timestamp()
  )
  on conflict (singleton) do update
    set paused = excluded.paused,
        reason = excluded.reason,
        updated_at = excluded.updated_at
  returning * into v_control;

  return jsonb_build_object(
    'paused', v_control.paused,
    'reason', v_control.reason,
    'updatedAt', v_control.updated_at
  );
end;
$$;

-- This trigger is a database-level backstop for the one study write that is
-- initiated directly by the authenticated browser. Service-role recovery and
-- reconciliation remain possible while the release is paused.
create or replace function public.prevent_browser_capture_insert_while_study_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paused boolean;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Hold a row-strength lock until the capture insert commits. The operator
  -- setter therefore either waits for this already-started insert or wins
  -- first and makes this insert observe the active pause.
  select control.paused
    into v_paused
  from private.study_write_runtime_control control
  where control.singleton
  for share;

  if coalesce(v_paused, true) then
    raise exception using
      errcode = '55000',
      message = 'study_writes_paused';
  end if;

  return new;
end;
$$;

drop trigger if exists captures_prevent_insert_while_study_paused
  on public.captures;
create trigger captures_prevent_insert_while_study_paused
before insert on public.captures
for each row execute function public.prevent_browser_capture_insert_while_study_paused();

revoke all on function public.get_study_write_pause()
  from public, anon, authenticated;
grant execute on function public.get_study_write_pause()
  to service_role;

revoke all on function public.set_study_writes_paused(boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_study_writes_paused(boolean, text)
  to service_role;

revoke all on function public.prevent_browser_capture_insert_while_study_paused()
  from public, anon, authenticated;
grant execute on function public.prevent_browser_capture_insert_while_study_paused()
  to service_role;

comment on table private.study_write_runtime_control is
  'Private singleton controlling the short study-write pause required by staged backend rollouts.';
comment on function public.get_study_write_pause() is
  'Service-only fail-closed read of the current study-write pause state.';
comment on function public.set_study_writes_paused(boolean, text) is
  'Service-only operator control for pausing or resuming study writes.';
