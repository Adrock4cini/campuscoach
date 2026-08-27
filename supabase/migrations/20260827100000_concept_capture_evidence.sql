-- Preserve stable concept mastery while retaining every owner-scoped capture
-- that supplied evidence for that concept. A concept may be deduplicated across
-- several assignments; practice still needs the exact selected capture.

create table if not exists public.concept_capture_evidence (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  capture_id uuid not null references public.captures(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, concept_id, capture_id)
);

create index if not exists concept_capture_evidence_capture_idx
  on public.concept_capture_evidence (user_id, capture_id, created_at desc);

create or replace function public.enforce_concept_capture_evidence_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_concept_user_id uuid;
  v_concept_class_id uuid;
  v_concept_client_class_id text;
  v_capture_user_id uuid;
  v_capture_class_id uuid;
  v_capture_client_class_id text;
begin
  -- Capture-first matches confirmation, artifact insertion and Tutor grading.
  -- A single lock order avoids a concept/evidence writer deadlocking with a
  -- source confirmation that already owns the capture row.
  select capture.user_id, capture.class_id, capture.client_class_id
    into v_capture_user_id, v_capture_class_id, v_capture_client_class_id
  from public.captures capture
  where capture.id = new.capture_id
  for share;

  select concept.user_id, concept.class_id, concept.client_class_id
    into v_concept_user_id, v_concept_class_id, v_concept_client_class_id
  from public.concepts concept
  where concept.id = new.concept_id
  for share;

  if v_concept_user_id is null
      or v_capture_user_id is null
      or new.user_id <> v_concept_user_id
      or new.user_id <> v_capture_user_id
      or v_concept_class_id is distinct from v_capture_class_id
      or v_concept_client_class_id is distinct from v_capture_client_class_id then
    raise exception using
      errcode = '23514',
      message = 'concept/capture evidence boundary mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists concept_capture_evidence_boundary
  on public.concept_capture_evidence;
create trigger concept_capture_evidence_boundary
before insert or update on public.concept_capture_evidence
for each row execute function public.enforce_concept_capture_evidence_boundary();

-- Once provenance exists, owner/class changes must not strand a link across
-- an authorization boundary. Capture ingestion resolves class identity before
-- it creates evidence, so a linked row has no legitimate in-place reparenting
-- path; create a new capture/concept instead.
create or replace function public.prevent_concept_capture_evidence_drift()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.user_id is distinct from new.user_id
      or old.class_id is distinct from new.class_id
      or old.client_class_id is distinct from new.client_class_id)
      and exists (
        select 1
        from public.concept_capture_evidence evidence
        where (tg_table_name = 'concepts' and evidence.concept_id = old.id)
           or (tg_table_name = 'captures' and evidence.capture_id = old.id)
      ) then
    raise exception using
      errcode = '23514',
      message = 'linked concept/capture provenance cannot be reparented';
  end if;
  return new;
end;
$$;

drop trigger if exists concept_capture_evidence_concept_drift on public.concepts;
create trigger concept_capture_evidence_concept_drift
before update of user_id, class_id, client_class_id on public.concepts
for each row execute function public.prevent_concept_capture_evidence_drift();

drop trigger if exists concept_capture_evidence_capture_drift on public.captures;
create trigger concept_capture_evidence_capture_drift
before update of user_id, class_id, client_class_id on public.captures
for each row execute function public.prevent_concept_capture_evidence_drift();

-- Migration-first compatibility: old Edge code may insert a concept with a
-- primary capture immediately before the newer explicit evidence write. Mirror
-- that primary relation inside the same transaction so a killed request cannot
-- leave a ready-looking capture with no authoritative occurrence row.
create or replace function public.mirror_concept_primary_capture_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capture_id is not null then
    insert into public.concept_capture_evidence (user_id, concept_id, capture_id)
    values (new.user_id, new.id, new.capture_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists concept_primary_capture_evidence_mirror on public.concepts;
create trigger concept_primary_capture_evidence_mirror
after insert or update of capture_id on public.concepts
for each row execute function public.mirror_concept_primary_capture_evidence();

insert into public.concept_capture_evidence (user_id, concept_id, capture_id)
select concept.user_id, concept.id, capture.id
from public.concepts concept
join public.captures capture
  on capture.id = concept.capture_id
 and capture.user_id = concept.user_id
where concept.capture_id is not null
  and concept.class_id is not distinct from capture.class_id
  and concept.client_class_id is not distinct from capture.client_class_id
on conflict do nothing;

alter table public.concept_capture_evidence enable row level security;
revoke all on table public.concept_capture_evidence from public, anon, authenticated;
grant select on table public.concept_capture_evidence to authenticated;
grant all on table public.concept_capture_evidence to service_role;

drop policy if exists "concept_capture_evidence_owner_select"
  on public.concept_capture_evidence;
create policy "concept_capture_evidence_owner_select"
on public.concept_capture_evidence
for select
to authenticated
using (public.owns_row(user_id));

revoke all on function public.enforce_concept_capture_evidence_boundary()
  from public, anon, authenticated;
grant execute on function public.enforce_concept_capture_evidence_boundary()
  to service_role;

revoke all on function public.prevent_concept_capture_evidence_drift()
  from public, anon, authenticated;
grant execute on function public.prevent_concept_capture_evidence_drift()
  to service_role;

revoke all on function public.mirror_concept_primary_capture_evidence()
  from public, anon, authenticated;
grant execute on function public.mirror_concept_primary_capture_evidence()
  to service_role;

comment on table public.concept_capture_evidence is
  'Owner- and class-scoped provenance linking one stable concept to every source capture that evidenced it.';
