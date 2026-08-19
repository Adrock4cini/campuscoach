create table if not exists public.study_strategy_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  artifact_id uuid references public.learning_artifacts(id) on delete set null,
  subject_profile text,
  task_kind text,
  format text,
  strategy_id text,
  technique text,
  modality text,
  outcome_source text not null default 'study_result',
  correct integer not null,
  total integer not null,
  mastery_delta real,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint study_strategy_outcomes_source_check
    check (outcome_source in ('study_result', 'feedback')),
  constraint study_strategy_outcomes_counts_check
    check (total > 0 and total <= 100 and correct >= 0 and correct <= total),
  constraint study_strategy_outcomes_signal_check
    check (strategy_id is not null or format is not null or technique is not null)
);

grant select, insert on public.study_strategy_outcomes to authenticated;
grant all on public.study_strategy_outcomes to service_role;

alter table public.study_strategy_outcomes enable row level security;

create policy "Owners read their strategy outcomes"
  on public.study_strategy_outcomes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Owners record their own strategy outcomes"
  on public.study_strategy_outcomes
  for insert
  to authenticated
  with check (auth.uid() = user_id and outcome_source = 'feedback');

create index if not exists study_strategy_outcomes_lookup_idx
  on public.study_strategy_outcomes (user_id, subject_profile, task_kind, occurred_at desc);