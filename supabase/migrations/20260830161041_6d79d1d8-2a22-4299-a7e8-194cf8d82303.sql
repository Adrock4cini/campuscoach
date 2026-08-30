-- Service-enforced acceptance record for the invite-only 13+ family beta.
--
-- Auth user_metadata is client-writable and therefore cannot be evidence that
-- the current agreement was accepted. This append-only owner record is written
-- only through the authenticated RPC below. Existing metadata is deliberately
-- not backfilled: every account without a durable current-version receipt must
-- accept once after this migration and the matching client are released.

create table if not exists public.family_beta_agreement_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  agreement_version text not null,
  accepted_at timestamptz not null default statement_timestamp(),
  accepted_by uuid not null references auth.users(id) on delete cascade,
  primary key (user_id, agreement_version),
  constraint family_beta_agreement_acceptances_owner_check
    check (accepted_by = user_id),
  constraint family_beta_agreement_acceptances_version_check
    check (
      char_length(agreement_version) between 1 and 40
      and agreement_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([.][0-9]+)?$'
    )
);

comment on table public.family_beta_agreement_acceptances is
  'Immutable per-version owner receipts for the 13+ family-beta agreement; never inferred from Auth metadata.';

alter table public.family_beta_agreement_acceptances enable row level security;

create or replace function public.prevent_family_beta_agreement_receipt_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise insufficient_privilege using
    message = 'family beta agreement receipts are append-only';
end;
$$;

drop trigger if exists family_beta_agreement_receipts_append_only
  on public.family_beta_agreement_acceptances;
create trigger family_beta_agreement_receipts_append_only
before update on public.family_beta_agreement_acceptances
for each row execute function public.prevent_family_beta_agreement_receipt_update();

-- The browser cannot read or mutate the audit table directly. The two narrow
-- RPCs below expose only the current subject's current-version status and an
-- idempotent acceptance operation. The service role retains deletion access so
-- the documented account-erasure workflow and auth.users cascade still work.
revoke all privileges on table public.family_beta_agreement_acceptances
  from public, anon, authenticated;
grant select, insert, delete on table public.family_beta_agreement_acceptances
  to service_role;

revoke all on function public.prevent_family_beta_agreement_receipt_update()
  from public, anon, authenticated, service_role;

create or replace function public.get_family_beta_agreement_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version constant text := '2026-08-17';
  v_accepted_at timestamptz;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  select receipt.accepted_at
    into v_accepted_at
  from public.family_beta_agreement_acceptances receipt
  where receipt.user_id = v_user_id
    and receipt.agreement_version = v_current_version;

  return jsonb_build_object(
    'accepted', v_accepted_at is not null,
    'agreementVersion', v_current_version,
    'acceptedAt', to_jsonb(v_accepted_at),
    'ownerId', v_user_id
  );
end;
$$;

create or replace function public.accept_family_beta_agreement(
  p_agreement_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version constant text := '2026-08-17';
  v_accepted_at timestamptz;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'authentication required';
  end if;

  if p_agreement_version is distinct from v_current_version then
    raise invalid_parameter_value using message = 'agreement version is not current';
  end if;

  insert into public.family_beta_agreement_acceptances (
    user_id,
    agreement_version,
    accepted_by
  )
  values (
    v_user_id,
    v_current_version,
    v_user_id
  )
  on conflict (user_id, agreement_version) do nothing;

  select receipt.accepted_at
    into strict v_accepted_at
  from public.family_beta_agreement_acceptances receipt
  where receipt.user_id = v_user_id
    and receipt.agreement_version = v_current_version
    and receipt.accepted_by = v_user_id;

  return jsonb_build_object(
    'accepted', true,
    'agreementVersion', v_current_version,
    'acceptedAt', to_jsonb(v_accepted_at),
    'ownerId', v_user_id
  );
end;
$$;

revoke all on function public.get_family_beta_agreement_status()
  from public, anon, authenticated;
grant execute on function public.get_family_beta_agreement_status()
  to authenticated;

revoke all on function public.accept_family_beta_agreement(text)
  from public, anon, authenticated;
grant execute on function public.accept_family_beta_agreement(text)
  to authenticated;

grant execute on function public.get_family_beta_agreement_status()
  to service_role;
grant execute on function public.accept_family_beta_agreement(text)
  to service_role;