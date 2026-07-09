
-- Artifact kind enum: reserved values for every planned format.
DO $$ BEGIN
  CREATE TYPE public.artifact_kind AS ENUM (
    'flashcards',
    'multiple_choice',
    'fill_blank',
    'matching',
    'practice',
    'study_guide',
    'cheat_sheet',
    'eli5',
    'eli_professor',
    'mnemonic'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.learning_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_id text,
  kind public.artifact_kind NOT NULL,
  concept_ids uuid[] NOT NULL DEFAULT '{}',
  capture_id uuid,
  topic text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  prompt_version text NOT NULL DEFAULT 'v1',
  stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_artifacts_user_kind_idx
  ON public.learning_artifacts (user_id, kind, created_at DESC);
CREATE INDEX learning_artifacts_capture_idx
  ON public.learning_artifacts (capture_id) WHERE capture_id IS NOT NULL;
CREATE INDEX learning_artifacts_class_idx
  ON public.learning_artifacts (user_id, class_id) WHERE class_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_artifacts TO authenticated;
GRANT ALL ON public.learning_artifacts TO service_role;

ALTER TABLE public.learning_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their artifacts"
  ON public.learning_artifacts FOR SELECT
  USING (public.owns_row(user_id));
CREATE POLICY "Owners can insert their artifacts"
  ON public.learning_artifacts FOR INSERT
  WITH CHECK (public.owns_row(user_id));
CREATE POLICY "Owners can update their artifacts"
  ON public.learning_artifacts FOR UPDATE
  USING (public.owns_row(user_id))
  WITH CHECK (public.owns_row(user_id));
CREATE POLICY "Owners can delete their artifacts"
  ON public.learning_artifacts FOR DELETE
  USING (public.owns_row(user_id));

CREATE TRIGGER trg_learning_artifacts_updated_at
  BEFORE UPDATE ON public.learning_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
