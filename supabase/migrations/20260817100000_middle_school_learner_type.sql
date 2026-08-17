BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_learner_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_learner_type_check
  CHECK (
    learner_type IS NULL
    OR learner_type IN ('middle_school', 'high_school', 'college', 'certification', 'other')
  );

COMMIT;
