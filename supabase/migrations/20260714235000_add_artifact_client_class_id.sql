-- Keep the database class UUID separate from the stable app-facing class key.
-- Production has treated learning_artifacts.class_id as a UUID in some
-- environments, while the React app uses values such as "math". Storing both
-- removes that ambiguity and matches concepts/captures/readiness.
ALTER TABLE public.learning_artifacts
  ADD COLUMN IF NOT EXISTS client_class_id text;

-- Backfill through the real class UUID first. If an older environment stored
-- the client key directly in class_id, preserve it as a final fallback.
UPDATE public.learning_artifacts AS artifact
SET client_class_id = class_row.client_class_id
FROM public.classes AS class_row
WHERE artifact.client_class_id IS NULL
  AND artifact.class_id::text = class_row.id::text;

DO $$
DECLARE
  class_id_type text;
BEGIN
  SELECT data_type INTO class_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'learning_artifacts'
    AND column_name = 'class_id';

  IF class_id_type IN ('text', 'character varying') THEN
    EXECUTE $sql$
      UPDATE public.learning_artifacts
      SET client_class_id = class_id::text
      WHERE client_class_id IS NULL AND class_id IS NOT NULL
    $sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS learning_artifacts_client_class_idx
  ON public.learning_artifacts (user_id, client_class_id, kind, created_at DESC)
  WHERE client_class_id IS NOT NULL;
