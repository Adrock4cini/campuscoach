
create extension if not exists vector;

-- ============================
-- concepts (per-user, per-class knowledge nodes)
-- ============================
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  class_id uuid references public.classes(id) on delete cascade,
  client_class_id text,
  capture_id uuid references public.captures(id) on delete set null,
  name text not null,
  slug text not null,
  definition text,
  examples text[] not null default '{}',
  professor_emphasis boolean not null default false,
  embedding vector(1536),
  source_kind text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists concepts_user_idx on public.concepts(user_id);
create index if not exists concepts_class_idx on public.concepts(class_id);
create index if not exists concepts_user_class_slug_idx on public.concepts(user_id, class_id, slug);
create index if not exists concepts_embedding_idx on public.concepts using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on public.concepts to authenticated;
grant all on public.concepts to service_role;

alter table public.concepts enable row level security;

create policy "concepts_owner_select" on public.concepts for select using (owns_row(user_id));
create policy "concepts_owner_insert" on public.concepts for insert with check (owns_row(user_id));
create policy "concepts_owner_update" on public.concepts for update using (owns_row(user_id));
create policy "concepts_owner_delete" on public.concepts for delete using (owns_row(user_id));

create trigger concepts_updated_at
before update on public.concepts
for each row execute function public.update_updated_at_column();

-- ============================
-- user_concept_mastery (spaced-repetition memory per user+concept)
-- ============================
create table if not exists public.user_concept_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  strength real not null default 0,             -- 0..1
  attempts int not null default 0,
  correct int not null default 0,
  last_seen_at timestamptz,
  next_review_at timestamptz,
  streak int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, concept_id)
);

create index if not exists ucm_user_idx on public.user_concept_mastery(user_id);
create index if not exists ucm_class_idx on public.user_concept_mastery(class_id);
create index if not exists ucm_next_review_idx on public.user_concept_mastery(user_id, next_review_at);

grant select, insert, update, delete on public.user_concept_mastery to authenticated;
grant all on public.user_concept_mastery to service_role;

alter table public.user_concept_mastery enable row level security;

create policy "ucm_owner_select" on public.user_concept_mastery for select using (owns_row(user_id));
create policy "ucm_owner_insert" on public.user_concept_mastery for insert with check (owns_row(user_id));
create policy "ucm_owner_update" on public.user_concept_mastery for update using (owns_row(user_id));
create policy "ucm_owner_delete" on public.user_concept_mastery for delete using (owns_row(user_id));

create trigger ucm_updated_at
before update on public.user_concept_mastery
for each row execute function public.update_updated_at_column();
