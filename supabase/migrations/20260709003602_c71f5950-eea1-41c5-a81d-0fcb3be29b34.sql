
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS learner_type text,
  ADD COLUMN IF NOT EXISTS term text,
  ADD COLUMN IF NOT EXISTS work_schedule text,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_learner_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_learner_type_check
  CHECK (learner_type IS NULL OR learner_type IN ('high_school','college','certification','other'));
