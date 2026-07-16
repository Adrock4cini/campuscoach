-- Assessment-scoped study foundation.
--
-- A learning artifact is still disposable, but it must remember the target it
-- was generated for. This prevents a "next exam" set from silently loading a
-- class-wide or previous-unit artifact. Study sessions copy the same identity
-- so mastery and readiness can be interpreted in the correct context.

alter table public.learning_artifacts
  add column if not exists study_scope_type text not null default 'class',
  add column if not exists study_scope_id text not null default 'class',
  add column if not exists study_scope_label text,
  add column if not exists study_scope_snapshot jsonb not null default '{}'::jsonb;

alter table public.learning_artifacts
  drop constraint if exists learning_artifacts_study_scope_type_check;

alter table public.learning_artifacts
  add constraint learning_artifacts_study_scope_type_check
  check (study_scope_type in ('recent', 'exam', 'class'));

create index if not exists learning_artifacts_scope_lookup_idx
  on public.learning_artifacts
  (user_id, client_class_id, study_scope_type, study_scope_id, kind, stale, created_at desc);

alter table public.study_sessions
  add column if not exists study_scope_type text not null default 'class',
  add column if not exists study_scope_id text not null default 'class',
  add column if not exists study_scope_label text,
  add column if not exists study_scope_snapshot jsonb not null default '{}'::jsonb;

alter table public.study_sessions
  drop constraint if exists study_sessions_study_scope_type_check;

alter table public.study_sessions
  add constraint study_sessions_study_scope_type_check
  check (study_scope_type in ('recent', 'exam', 'class'));

create index if not exists study_sessions_scope_lookup_idx
  on public.study_sessions
  (user_id, client_class_id, study_scope_type, study_scope_id, created_at desc);
